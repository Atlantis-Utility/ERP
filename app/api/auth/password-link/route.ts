import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin, ApiAuthError } from "@/lib/api-auth";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { buildPasswordLinkEmail } from "@/lib/email/password-link-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sends someone a link to set or reset their password.
 *
 * Two callers, one route:
 *   invite  an administrator setting up a login for a new person, typically
 *           someone outside the Microsoft tenant who can't use the
 *           "Continue with Microsoft" button
 *   reset   the "Forgot password?" link on the sign-in page, unauthenticated
 *           by nature
 *
 * The link points at *our* /set-password carrying Supabase's one-time token
 * hash, rather than at Supabase's /verify endpoint. Two reasons: the target
 * doesn't have to be on Supabase's redirect allowlist (http://localhost:3000
 * /set-password isn't, and silently falls back to the production site), and
 * the token arrives as a query parameter the page can verify, instead of a
 * URL fragment that only survives if every redirect in the chain happens to
 * preserve it.
 *
 * The mail goes out through Resend like everything else the app sends.
 * Supabase's built-in mailer is rate limited to a few an hour and sends from
 * a supabase.co address.
 */

/** A reset can only be asked for on behalf of somebody we employ. */
async function employeeFor(email: string) {
  const db = createServiceRoleClient();
  const { data } = await db.from("employees").select("id, name, email").ilike("email", email).maybeSingle();
  return data as { id: string; name: string; email: string } | null;
}

function appOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const headers = req.headers;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export async function POST(req: Request) {
  let kind: "invite" | "reset" = "reset";
  try {
    const body = (await req.json()) as { email?: string; kind?: "invite" | "reset" };
    kind = body.kind === "invite" ? "invite" : "reset";
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter an email address" }, { status: 400 });
    }

    let invitedByName: string | null = null;
    if (kind === "invite") {
      const actor = await requireAdmin();
      invitedByName = actor.email;
    }

    const employee = await employeeFor(email);
    if (kind === "invite" && !employee) {
      return NextResponse.json(
        { error: "That address isn't on any employee record. Add the employee first, then send the invite." },
        { status: 400 },
      );
    }

    // A reset for an address we don't employ is answered the same way as one
    // we do: an endpoint that says "no such account" is an endpoint that
    // lists your staff for anyone who asks.
    if (kind === "reset" && !employee) return NextResponse.json({ ok: true });

    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: "Email isn't configured on this deployment, so the link can't be sent." },
        { status: 503 },
      );
    }

    const db = createServiceRoleClient();
    const { data: userList } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = userList?.users.find((u) => u.email?.toLowerCase() === email);

    if (kind === "reset" && !existing) return NextResponse.json({ ok: true });

    // An invite creates the login and lasts a day; a recovery link is for one
    // that exists and lasts an hour. Both hand back a one-time token hash.
    const linkType = existing ? "recovery" : "invite";
    const { data: link, error: linkErr } = await db.auth.admin.generateLink({
      type: linkType,
      email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      console.error("[auth:password-link] generateLink failed", linkErr);
      return NextResponse.json({ error: "Couldn't create the link. Try again." }, { status: 500 });
    }

    const url = new URL("/set-password", appOrigin(req));
    url.searchParams.set("token_hash", link.properties.hashed_token);
    url.searchParams.set("type", linkType);

    const { subject, html } = buildPasswordLinkEmail({
      kind: existing && kind === "reset" ? "reset" : "invite",
      name: employee?.name ?? null,
      url: url.toString(),
      invitedByName,
      expiresInHours: linkType === "invite" ? 24 : 1,
    });
    await sendEmail({ to: email, subject, html });

    return NextResponse.json({ ok: true, created: !existing });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[auth:password-link]", err);
    // A reset must not become a way to probe for accounts, so even a failure
    // reads the same from outside.
    if (kind === "reset") return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "Couldn't send the link" }, { status: 500 });
  }
}
