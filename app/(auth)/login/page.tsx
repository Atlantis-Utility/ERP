"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { loginWithMicrosoft, authUser, loading } = useAuth();

  const [error, setError]   = useState("");
  const [msBusy, setMsBusy] = useState(false);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
                <rect x="1" y="1" width="7.5" height="7.5" fill="#F25022"/>
                <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7FBA00"/>
                <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00A4EF"/>
                <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900"/>
              </svg>
            )}
            <span className="flex-1 text-left">{msBusy ? "Signing in…" : "Continue with Microsoft"}</span>
          </button>
        </div>

        {error && (
          <p className="mt-4 text-xs text-[#f31260] bg-[#fff0f3] border border-[#fecdd3] rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>

      <p className="text-center text-xs text-[#999] mt-5">
        Atlantis Utility &copy; {new Date().getFullYear()}
      </p>
    </div>
  );
}
