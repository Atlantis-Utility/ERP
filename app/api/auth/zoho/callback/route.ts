import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { parse as parseCookies } from "cookie";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ZOHO_STATE_COOKIE, zohoConfigured, zohoIdentityFromCode, zohoRedirectUri } from "@/lib/zoho-auth";
import { appOrigin } from "@/lib/app-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Step two: Zoho sends the person back here.
 *
 * What happens after that is the whole point of writing this by hand. Zoho
 * tells us which account signed in; that address then has to match an
 * employee record before any session exists. Somebody with a perfectly
 * valid Zoho account who doesn't work here gets nothing.
 *
 * The Supabase session is established server-side: a one-time token is
 * minted with the service key and immediately redeemed through the
 * cookie-writing server client, so the browser is signed in by the time it
 * follows the redirect. No token is ever handed to the page.
 */
export async function GET(req: Request) {
  const origin = appOrigin(req);
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, origin));

  if (!zohoConfigured()) return fail("zoho_not_configured");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const zohoError = url.searchParams.get("error");

  if (zohoError) return fail("zoho_cancelled");
  if (!code || !state) return fail("zoho_bad_response");

  // The cookie is the other half of the state we sent; a callback that
  // can't produce it didn't start here.
  const cookieHeader = req.headers.get("cookie") ?? "";
  const expected = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ZOHO_STATE_COOKIE}=`))
    ?.slice(ZOHO_STATE_COOKIE.length + 1);
  if (!expected || expected !== state) return fail("zoho_state_mismatch");

  let identity;
  try {
    // The same URI the code was issued for, or Zoho rejects the trade.
    identity = await zohoIdentityFromCode({ code, redirectUri: zohoRedirectUri(origin) });
  } catch (err) {
    console.error("[auth:zoho]", err);
    return fail("zoho_exchange_failed");
  }

  const admin = createServiceRoleClient();

  // Being able to sign in to Zoho is not the same as working here.
  const { data: employee, error: employeeErr } = await admin
    .from("employees")
    .select("id, name")
    .ilike("email", identity.email)
    .maybeSingle();
  if (employeeErr) {
    console.error("[auth:zoho] employee lookup failed", employeeErr);
    return fail("zoho_lookup_failed");
  }
  if (!employee) return fail("not_an_employee");

  // Find or create the Supabase user for that address. Created confirmed
  // and with no password: Zoho is how they sign in, so there is nothing
  // here to guess or leak.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const exists = list?.users.some((u) => u.email?.toLowerCase() === identity.email);
  if (!exists) {
    const { error: createErr } = await admin.auth.admin.createUser({
      email: identity.email,
      email_confirm: true,
      user_metadata: { display_name: identity.displayName ?? employee.name, signed_in_with: "zoho" },
    });
    if (createErr) {
      console.error("[auth:zoho] createUser failed", createErr);
      return fail("zoho_account_failed");
    }
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: identity.email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    console.error("[auth:zoho] generateLink failed", linkErr);
    return fail("zoho_session_failed");
  }

  // The session cookies are collected rather than written through
  // next/headers, then attached to the redirect by hand: a cookie set on
  // the request store doesn't reliably ride along on a Response the
  // handler constructs itself, and a redirect that drops the session is a
  // sign-in loop that looks like the password is wrong.
  const jar = parseCookies(cookieHeader);
  type PendingCookie = Parameters<NonNullable<Parameters<typeof createServerClient>[2]["cookies"]["setAll"]>>[0][number];
  const pending: PendingCookie[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value: value ?? "" })),
        setAll: (cookies) => {
          pending.push(...cookies);
        },
      },
    },
  );
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyErr) {
    console.error("[auth:zoho] verifyOtp failed", verifyErr);
    return fail("zoho_session_failed");
  }

  const res = NextResponse.redirect(new URL("/", origin));
  for (const c of pending) res.cookies.set(c.name, c.value, c.options);
  res.cookies.set(ZOHO_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
