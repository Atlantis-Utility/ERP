import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireEmployee, ApiAuthError } from "@/lib/api-auth";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { buildAccessEmail, type SharedKind } from "@/lib/email/access-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tells somebody they've been given something.
 *
 * Sharing is silent otherwise: whoever you handed a call sheet to finds out
 * when they next happen to look, which for work they're expected to pick up
 * is too late to be any use.
 *
 * The recipient is named by employee id, never by email address, and this
 * route looks the address up itself. That is the whole security model: it
 * cannot be pointed at an outsider, so it is a notifier rather than a relay
 * anybody with a session could send mail through.
 *
 * It does not check that the share actually happened. It can't usefully -
 * the grant lives in four different tables with four different rules - and
 * the mail says only that something was shared and where it is. The link
 * behind it is governed by the same access as everything else: if the share
 * failed, the recipient opens it and sees nothing they shouldn't.
 */
const KINDS: SharedKind[] = ["note", "campaign", "lead", "vault"];

function pathFor(kind: SharedKind, id: string): string {
  if (kind === "campaign") return `/leads/campaigns/${encodeURIComponent(id)}`;
  if (kind === "lead") return `/leads?lead=${encodeURIComponent(id)}`;
  if (kind === "note") return `/notes?note=${encodeURIComponent(id)}`;
  return "/vault";
}

function appOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export async function POST(req: Request) {
  try {
    const actor = await requireEmployee();
    const body = (await req.json()) as {
      toEmployeeId?: string;
      kind?: SharedKind;
      id?: string;
      name?: string;
      level?: string;
    };

    const kind = body.kind && KINDS.includes(body.kind) ? body.kind : null;
    const toEmployeeId = (body.toEmployeeId ?? "").trim();
    const id = (body.id ?? "").trim();
    if (!kind || !toEmployeeId || (!id && kind !== "vault")) {
      return NextResponse.json({ error: "Nothing to notify about" }, { status: 400 });
    }

    if (!isEmailConfigured()) {
      return NextResponse.json({ error: "EMAIL_NOT_CONFIGURED" }, { status: 503 });
    }

    const db = createServiceRoleClient();
    const { data: recipient } = await db
      .from("employees")
      .select("id, name, email")
      .eq("id", toEmployeeId)
      .maybeSingle();
    const to = recipient as { id: string; name: string; email: string | null } | null;
    if (!to?.email) {
      return NextResponse.json({ error: "NO_EMAIL_ON_FILE" }, { status: 422 });
    }
    // Telling yourself is a no-op, not a failure.
    if (to.id === actor.employeeId) return NextResponse.json({ sent: false, reason: "self" });

    const { subject, html } = buildAccessEmail({
      kind,
      name: (body.name ?? "").trim(),
      toName: to.name,
      fromName: actor.name,
      level: body.level ?? null,
      url: `${appOrigin(req)}${pathFor(kind, id)}`,
    });
    await sendEmail({ to: to.email, subject, html });

    return NextResponse.json({ sent: true, to: to.email });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[notify/access]", err);
    return NextResponse.json({ error: "Couldn't send that notification" }, { status: 500 });
  }
}
