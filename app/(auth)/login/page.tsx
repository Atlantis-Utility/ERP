"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithGoogle, authUser, loading } = useAuth();

  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [error, setError]         = useState("");
  const [busy, setBusy]           = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (!loading && authUser) router.replace("/");
  }, [authUser, loading, router]);

  async function handleGoogleSignIn() {
    setError("");
    setGoogleBusy(true);
    try {
      await loginWithGoogle();
      // redirect is handled by the useEffect below once authUser is set
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("popup-closed-by-user") || msg.includes("cancelled-popup-request")) {
        // user closed the popup — silently ignore
      } else {
        setError("Google sign-in failed. Please try again.");
      }
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email.trim(), password);
      // redirect is handled by the useEffect below once authUser is set
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      if (msg.includes("user-not-found") || msg.includes("wrong-password") || msg.includes("invalid-credential")) {
        setError("Invalid email or password.");
      } else if (msg.includes("too-many-requests")) {
        setError("Too many attempts. Please try again later.");
      } else {
        setError("Login failed. Check your credentials.");
      }
    } finally {
      setBusy(false);
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
          <p className="text-sm text-[#666]">Welcome back. Enter your credentials to continue.</p>
        </div>

        {/* Google Sign-in */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleBusy || busy}
          className="w-full flex items-center justify-center gap-2.5 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] py-2.5 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-5"
        >
          {googleBusy ? (
            <span className="w-4 h-4 border-2 border-[#ccc] border-t-[#0a0a0a] rounded-full animate-spin" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
            </svg>
          )}
          {googleBusy ? "Signing in..." : "Continue with Google"}
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-[#eaeaea]" />
          <span className="text-xs text-[#bbb]">or</span>
          <div className="flex-1 h-px bg-[#eaeaea]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#444] mb-1.5">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="you@atlantis.io"
              className="w-full border border-[#eaeaea] rounded-lg px-3 py-2.5 text-sm text-[#0a0a0a] placeholder:text-[#bbb] focus:outline-none focus:border-[#0a0a0a] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#444] mb-1.5">Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="Your password"
              className="w-full border border-[#eaeaea] rounded-lg px-3 py-2.5 text-sm text-[#0a0a0a] placeholder:text-[#bbb] focus:outline-none focus:border-[#0a0a0a] transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-[#f31260] bg-[#fff0f3] border border-[#fecdd3] rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[#0a0a0a] text-white text-sm font-medium py-2.5 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
          >
            {busy && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-[#999] mt-5">
        Atlantis Utility &copy; {new Date().getFullYear()}
      </p>
    </div>
  );
}
