import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth (Microsoft) sign-in lands here with a PKCE `code` param, Supabase
// requires exchanging it for a session server-side before the browser has
// a valid cookie. Without this route, signInWithOAuth's redirectTo never
// completes the sign-in and the app bounces back to /login.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const vaultVerify = searchParams.get("vault_verify") === "1";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Vault "set up passkey" / "forgot passkey" flows send the employee
      // through a fresh Microsoft sign-in to re-prove their identity before
      // letting them create or reset a passkey, neither of those can be
      // gated by "knows the current passkey". This is that proof, valid for
      // a few minutes and consumed by /api/vault/passkey's set/reset path.
      let vaultVerifyErrorCode: string | null = null;
      if (vaultVerify && data.session?.user) {
        const msVerifiedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        const { error: verifyErr } = await supabase
          .from("vault_passkeys")
          .upsert({ uid: data.session.user.id, ms_verified_until: msVerifiedUntil }, { onConflict: "uid" });
        if (verifyErr) {
          console.error("[auth:callback] failed to stamp vault ms_verified_until", verifyErr);
          // Postgres error code only (e.g. 42P01 = table doesn't exist yet,
          // meaning migration-vault-sharing.sql hasn't been run), safe to
          // surface, not sensitive, and lets the UI give a specific reason
          // instead of a dead-end "try again".
          vaultVerifyErrorCode = verifyErr.code || "unknown";
        }
      }

      const redirectUrl = new URL(next, origin);
      if (vaultVerifyErrorCode) redirectUrl.searchParams.set("ms_verify_error", vaultVerifyErrorCode);

      // loginWithMicrosoft() requests Calendars.Read as part of this same
      // OAuth grant, so Microsoft hands back a calendar-scoped refresh token
      // right here, store it now and calendar sync needs zero extra
      // consent screens. If it's missing (e.g. Azure app registration
      // mismatch, or this was a password-based login with no Azure OAuth at
      // all), fall back to the standalone connect flow via ?post_login=1
      // (see DataPreloader.tsx). Skip this entirely for a vault
      // re-verification, that's a step-up re-auth on top of an existing
      // session, not a fresh login, and the ensuing full-page redirect to
      // /api/outlook-calendar/connect would otherwise yank the employee away
      // from /vault before they can use the verification they just earned.
      const providerRefreshToken = data.session?.provider_refresh_token;
      if (!providerRefreshToken && !vaultVerify) {
        redirectUrl.searchParams.set("post_login", "1");
      }

      const res = NextResponse.redirect(redirectUrl);

      if (providerRefreshToken) {
        res.cookies.set("outlook_refresh", providerRefreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 90, // 90 days
          path: "/",
        });
        res.cookies.set("outlook_connected", "1", {
          httpOnly: false,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 90,
          path: "/",
        });
      }

      return res;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
