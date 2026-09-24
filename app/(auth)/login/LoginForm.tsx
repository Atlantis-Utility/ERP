"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * Two buttons, one for each place our people have an account.
 *
 * Microsoft is unchanged and comes first: it's how everyone on the tenant
 * signs in, and the same grant hands back the calendar token. Zoho is for
 * everyone else, the people with no Microsoft account at all.
 *
 * Neither is a sign-up. Both check the address against the employee list
 * before any session exists, so having an account somewhere else is not a
 * way in here.
 *
 * There is also an email and password path (an invite sets the password,
 * see app/api/auth/password-link), kept behind NEXT_PUBLIC_PASSWORD_LOGIN
 * and off by default: with Zoho covering the people outside the tenant, a
 * password is one more thing to leak for nobody's benefit.
 */

// What a failed callback can send back, in words rather than codes.
const CALLBACK_ERRORS: Record<string, string> = {
  not_an_employee: "That account isn't on the employee list. Ask an administrator to add you first.",
  zoho_cancelled: "Zoho sign-in was cancelled.",
  zoho_not_configured: "Zoho sign-in isn't set up on this deployment yet.",
  zoho_state_mismatch: "That sign-in attempt expired. Try again.",
  zoho_exchange_failed: "Zoho couldn't confirm that sign-in. Try again.",
  zoho_lookup_failed: "Couldn't check the employee list just now. Try again.",
  zoho_account_failed: "Couldn't set up an account for that address.",
  zoho_session_failed: "Signed in with Zoho, but the session couldn't be started. Try again.",
  zoho_bad_response: "Zoho sent back something unexpected. Try again.",
};

export default function LoginForm({ zohoEnabled }: { zohoEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const { login, loginWithMicrosoft, authUser, loading, authError } = useAuth();

  const callbackError = params.get("error");

  const [error, setError] = useState("");
  const [msBusy, setMsBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState(false);
  /**
   * The password form is out of the way until it's needed. Microsoft and
   * Zoho cover everyone who has one of those accounts, and a page that
   * offers a password box to people who never use one is a page inviting
   * them to try. It opens on request, and by itself when a sign-in attempt
   * came back without a session, which is the moment the other two have
   * demonstrably failed for whoever is standing there.
   */
  const [showPassword, setShowPassword] = useState(Boolean(callbackError));

  useEffect(() => {
    if (!loading && authUser) router.replace("/");
  }, [authUser, loading, router]);

  async function handleMicrosoft() {
    setError("");
    setMsBusy(true);
    try {
      await loginWithMicrosoft();
    } catch (err: unknown) {
      console.error("[ms-login] signInWithPopup failed:", err);
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("popup-closed-by-user") && !msg.includes("cancelled-popup-request")) {
        setError("Microsoft sign-in failed. Please try again.");
      }
    } finally {
      setMsBusy(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        /Email not confirmed/i.test(msg)
          ? "That account hasn't been set up yet. Use the link in your invite email."
          : /Invalid login/i.test(msg)
            ? "That email and password don't match."
            : msg || "Couldn't sign you in. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setBusy(true);
    try {
      await fetch("/api/auth/password-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), kind: "reset" }),
      });
    } catch {
      // Ignored on purpose: the answer is the same either way, so a failure
      // here can't be used to work out who has an account.
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const message =
    error ||
    authError ||
    (callbackError ? (CALLBACK_ERRORS[callbackError] ?? "That sign-in didn't complete. Try again.") : "");

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="flex items-center gap-2.5 justify-center mb-8">
        <div className="w-8 h-8 rounded-xl bg-[#0a0a0a] flex items-center justify-center shrink-0">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L14 13H2L8 2Z" fill="white" fillOpacity="0.9" />
          </svg>
        </div>
        <span className="text-[17px] font-semibold text-[#0a0a0a] tracking-tight">Atlantis Utility</span>
      </div>

      <div className="bg-white border border-[#eaeaea] rounded-2xl p-8 shadow-sm">
        {forgot ? (
          sent ? (
            <>
              <h1 className="text-xl font-semibold text-[#0a0a0a] mb-1">Check your email</h1>
              <p className="text-sm text-[#666]">
                If <span className="font-medium text-[#0a0a0a]">{email.trim()}</span> has an account, a link to set a
                new password is on its way. It works once and expires in an hour.
              </p>
              <button
                type="button"
                onClick={() => {
                  setForgot(false);
                  setSent(false);
                }}
                className="mt-6 w-full border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-4 py-2.5 rounded-lg hover:bg-[#fafafa] transition-colors"
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-semibold text-[#0a0a0a] mb-1">Forgot your password?</h1>
                <p className="text-sm text-[#666]">We&apos;ll email you a link to set a new one.</p>
              </div>
              <form onSubmit={handleForgot} className="space-y-3">
                <input
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@atlantisutility.com"
                  className="w-full text-sm border border-[#eaeaea] rounded-lg px-3 py-2.5 outline-none focus:border-[#0070f3] transition-colors"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send the link"}
                </button>
                <button
                  type="button"
                  onClick={() => setForgot(false)}
                  className="w-full text-[13px] text-[#666] py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
                >
                  Back to sign in
                </button>
              </form>
            </>
          )
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-[#0a0a0a] mb-1">Sign in</h1>
              <p className="text-sm text-[#666]">Use your work account to continue.</p>
            </div>

            <div className="space-y-3">
              {/* Microsoft */}
              <button
                type="button"
                onClick={handleMicrosoft}
                disabled={msBusy}
                className="w-full flex items-center gap-3 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-4 py-2.5 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {msBusy ? (
                  <span className="w-4.5 h-4.5 border-2 border-[#ccc] border-t-[#0a0a0a] rounded-full animate-spin shrink-0" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
                    <rect x="1" y="1" width="7.5" height="7.5" fill="#F25022" />
                    <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7FBA00" />
                    <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00A4EF" />
                    <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900" />
                  </svg>
                )}
                <span className="flex-1 text-left">{msBusy ? "Signing in…" : "Continue with Microsoft"}</span>
              </button>

              {/* Zoho, for the people who aren't on the Microsoft tenant. */}
              {zohoEnabled && (
                <a
                  href="/api/auth/zoho/start"
                  className="w-full flex items-center gap-3 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-4 py-2.5 rounded-lg hover:bg-[#fafafa] transition-colors"
                >
                  {/* Zoho's mark, drawn rather than fetched, so the sign-in
                      page doesn't need a third party to render itself. */}
                  <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0" aria-hidden>
                    <rect x="1" y="4" width="7.5" height="4" rx="1" fill="#E42527" />
                    <rect x="1" y="10" width="7.5" height="4" rx="1" fill="#F9B21D" />
                    <rect x="9.5" y="4" width="7.5" height="4" rx="1" fill="#089949" />
                    <rect x="9.5" y="10" width="7.5" height="4" rx="1" fill="#226DB4" />
                  </svg>
                  <span className="flex-1 text-left">Continue with Zoho</span>
                </a>
              )}

              {zohoEnabled && (
                // Zoho signs you straight back in as whoever it already has
                // a session for, which is what you want every morning and
                // exactly what you don't want on a shared machine.
                <a
                  href="/api/auth/zoho/start?switch=1"
                  className="block text-center text-[11px] text-[#999] hover:text-[#666] transition-colors"
                >
                  Not you? Use a different Zoho account
                </a>
              )}
            </div>

            {!showPassword && (
              <button
                type="button"
                onClick={() => setShowPassword(true)}
                className="mt-5 w-full text-center text-[12px] text-[#666] py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
              >
                Sign in with a password instead
              </button>
            )}

            {showPassword && (
              <>
                <div className="flex items-center gap-3 my-5">
                  <span className="h-px flex-1 bg-[#eaeaea]" />
                  <span className="text-[11px] text-[#999]">or</span>
                  <span className="h-px flex-1 bg-[#eaeaea]" />
                </div>

                <form onSubmit={handlePassword} className="space-y-3">
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@atlantisutility.com"
                    className="w-full text-sm border border-[#eaeaea] rounded-lg px-3 py-2.5 outline-none focus:border-[#0070f3] transition-colors"
                  />
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full text-sm border border-[#eaeaea] rounded-lg px-3 py-2.5 outline-none focus:border-[#0070f3] transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
                  >
                    {busy ? "Signing in…" : "Sign in"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForgot(true);
                      setError("");
                    }}
                    className="w-full text-[12px] text-[#666] py-1 rounded-lg hover:bg-[#fafafa] transition-colors"
                  >
                    Forgot your password?
                  </button>
                </form>
              </>
            )}
          </>
        )}

        {message && (
          <p className="mt-4 text-xs text-[#f31260] bg-[#fff0f3] border border-[#fecdd3] rounded-lg px-3 py-2">
            {message}
          </p>
        )}
      </div>

      <p className="text-center text-xs text-[#999] mt-5">Atlantis Utility &copy; {new Date().getFullYear()}</p>
    </div>
  );
}
