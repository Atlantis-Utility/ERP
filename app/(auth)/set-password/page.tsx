"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * Where an invite or a reset link lands.
 *
 * The link carries Supabase's one-time token hash as a query parameter
 * (see app/api/auth/password-link/route.ts), which is exchanged for a
 * session here before the new password can be set. Doing it this way rather
 * than through Supabase's own /verify redirect keeps the link pointing at
 * our domain, so it works on localhost and in production without either
 * having to be on Supabase's redirect allowlist.
 */

type Stage = "verifying" | "ready" | "saving" | "done" | "invalid";

const MIN_LENGTH = 8;

function SetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const tokenHash = params.get("token_hash");
  const type = params.get("type") === "invite" ? "invite" : "recovery";

  const [stage, setStage] = useState<Stage>(tokenHash ? "verifying" : "invalid");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (!tokenHash) return;
    let cancelled = false;
    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type })
      .then(({ error: verifyError }) => {
        if (cancelled) return;
        if (verifyError) {
          setError(
            "That link has expired or has already been used. Ask for a new one from the sign-in page.",
          );
          setStage("invalid");
          return;
        }
        setStage("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setError("That link couldn't be checked. Ask for a new one from the sign-in page.");
        setStage("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [tokenHash, type]);

  async function save() {
    setError("");
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those two don't match.");
      return;
    }
    setStage("saving");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setStage("ready");
      return;
    }
    setStage("done");
    // Straight in: verifying the link already signed them in, and the
    // password they just set is the one they'll use next time.
    setTimeout(() => router.replace("/"), 900);
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center gap-2.5 justify-center mb-8">
        <div className="w-8 h-8 rounded-xl bg-[#0a0a0a] flex items-center justify-center shrink-0">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L14 13H2L8 2Z" fill="white" fillOpacity="0.9" />
          </svg>
        </div>
        <span className="text-[17px] font-semibold text-[#0a0a0a] tracking-tight">Atlantis Utility</span>
      </div>

      <div className="bg-white border border-[#eaeaea] rounded-2xl p-8 shadow-sm">
        {stage === "verifying" && (
          <div className="flex items-center gap-3 text-sm text-[#666]">
            <span className="w-4 h-4 border-2 border-[#ccc] border-t-[#0a0a0a] rounded-full animate-spin" />
            Checking your link…
          </div>
        )}

        {stage === "invalid" && (
          <>
            <h1 className="text-xl font-semibold text-[#0a0a0a] mb-1">This link won&apos;t work</h1>
            <p className="text-sm text-[#666]">{error || "The link is missing its token."}</p>
            <a
              href="/login"
              className="mt-6 inline-flex w-full items-center justify-center bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#333] transition-colors"
            >
              Back to sign in
            </a>
          </>
        )}

        {stage === "done" && (
          <>
            <h1 className="text-xl font-semibold text-[#0a0a0a] mb-1">You&apos;re all set</h1>
            <p className="text-sm text-[#666]">Taking you in…</p>
          </>
        )}

        {(stage === "ready" || stage === "saving") && (
          <>
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-[#0a0a0a] mb-1">
                {type === "invite" ? "Choose a password" : "Set a new password"}
              </h1>
              <p className="text-sm text-[#666]">
                {type === "invite"
                  ? "This is what you'll sign in with from now on."
                  : "You'll use this the next time you sign in."}
              </p>
            </div>

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-[11px] font-medium text-[#666]">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`At least ${MIN_LENGTH} characters`}
                  className="w-full text-sm border border-[#eaeaea] rounded-lg px-3 py-2.5 outline-none focus:border-[#0070f3] transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="confirm" className="text-[11px] font-medium text-[#666]">
                  Again, to be sure
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full text-sm border border-[#eaeaea] rounded-lg px-3 py-2.5 outline-none focus:border-[#0070f3] transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={stage === "saving"}
                className="w-full bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
              >
                {stage === "saving" ? "Saving…" : "Save and sign in"}
              </button>
            </form>
          </>
        )}

        {error && stage !== "invalid" && (
          <p className="mt-4 text-xs text-[#f31260] bg-[#fff0f3] border border-[#fecdd3] rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-5 h-5 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SetPasswordForm />
    </Suspense>
  );
}
