"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, ShieldCheck, Lock } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/FormField";
import { useAuth } from "@/lib/auth-context";
import {
  getVaultPasskeyStatus, setVaultPasskey, unlockVault,
} from "@/lib/db/vault";
import type { VaultPasskeyStatus } from "@/lib/vault-types";

interface Props {
  onUnlocked: () => void;
}

// Whole-screen gate that stands in for the vault's contents until the
// employee's own passkey is unlocked for this session. Handles first-time
// setup and the "forgot passkey" reset, both of which require a fresh
// Microsoft re-verification (see reverifyMicrosoftForVault) since neither
// can be gated by "knows the current passkey".
export default function VaultUnlockGate({ onUnlocked }: Props) {
  const { reverifyMicrosoftForVault } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<VaultPasskeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [forgotMode, setForgotMode] = useState(false);
  const [passkey, setPasskey] = useState("");
  const [confirmPasskey, setConfirmPasskey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const s = await getVaultPasskeyStatus();
      setStatus(s);
      if (s.isUnlocked) onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vault status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Coming back from a Microsoft re-verification redirect, clean the URL
    // and re-check status so the UI reflects the just-stamped verification.
    // A failure recording that verification server-side surfaces here
    // instead of just silently landing back on the same screen.
    const verifyErrorCode = searchParams.get("ms_verify_error");
    if (verifyErrorCode) {
      setError(
        verifyErrorCode === "42P01"
          ? "The vault database isn't fully set up yet (missing table), ask an admin to run the latest database migration."
          : verifyErrorCode === "42501"
          ? "The vault database rejected this write (permissions), ask an admin to check the database migration/policies."
          : `Verification didn't go through (error ${verifyErrorCode}), please try again.`
      );
    }
    if (searchParams.get("ms_verified") === "1" || verifyErrorCode) {
      router.replace("/vault");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleVerifyMicrosoft() {
    setBusy(true);
    setError("");
    try {
      await reverifyMicrosoftForVault();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Microsoft verification");
      setBusy(false);
    }
  }

  async function handleCreatePasskey() {
    setError("");
    if (passkey.length < 6) return setError("Passkey must be at least 6 characters");
    if (passkey !== confirmPasskey) return setError("Passkeys don't match");
    setBusy(true);
    try {
      await setVaultPasskey(passkey);
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set passkey");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    setError("");
    if (!passkey) return;
    setBusy(true);
    try {
      await unlockVault(passkey);
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect passkey");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading || !status) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // First-time setup or an explicit "forgot passkey" both need a fresh
  // Microsoft re-verification before they can create/reset a passkey.
  //
  // The re-verify round trip is a full-page redirect (Microsoft, then
  // /auth/callback, then back to /vault) — every in-memory React state
  // value, including forgotMode, resets to its initial value when the page
  // reloads. So showCreateForm can't depend on forgotMode still being true;
  // status.msVerified alone (stamped server-side, read fresh on mount) is
  // what actually survives the round trip, and it's only ever true right
  // after that verification — safe to treat as sufficient on its own.
  const needsMicrosoftVerify = !status.msVerified && (!status.hasPasskey || forgotMode);
  const showCreateForm = status.msVerified;

  if (needsMicrosoftVerify) {
    return (
      <div className="flex flex-col items-center justify-center text-center border border-dashed border-[#eaeaea] rounded-xl py-20 max-w-md mx-auto">
        <ShieldCheck className="w-8 h-8 text-[#0070f3] mb-3" />
        <p className="text-sm font-medium text-[#0a0a0a]">
          {status.hasPasskey ? "Verify your Microsoft account to reset your passkey" : "Verify your Microsoft account to set up your vault"}
        </p>
        <p className="text-xs text-[#999] mt-1 max-w-xs">
          {status.hasPasskey
            ? "Resetting a passkey without knowing the old one requires re-confirming it's really you."
            : "Your passkey protects this vault, we confirm it's really you before you set the first one."}
        </p>
        {error && <p className="text-xs text-[#f31260] mt-3">{error}</p>}
        <button
          onClick={handleVerifyMicrosoft}
          disabled={busy}
          className="mt-4 flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
        >
          Continue with Microsoft
        </button>
        {forgotMode && (
          <button onClick={() => setForgotMode(false)} className="mt-3 text-xs text-[#999] hover:text-[#666] underline">
            Cancel
          </button>
        )}
      </div>
    );
  }

  if (showCreateForm) {
    return (
      <div className="max-w-sm mx-auto border border-[#eaeaea] rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-[#0070f3]" />
          <p className="text-sm font-semibold text-[#0a0a0a]">{status.hasPasskey ? "Set a new passkey" : "Create your vault passkey"}</p>
        </div>
        <p className="text-xs text-[#999] mb-4">
          {status.hasPasskey
            ? "This replaces your old passkey, you'll use it to unlock your vault from now on."
            : "Only you know this, it unlocks your vault and can't be recovered by anyone else without re-verifying your Microsoft account."}
        </p>
        <div className="space-y-3">
          <FormField label="New passkey">
            <input
              className={inputClass}
              type="password"
              value={passkey}
              onChange={(e) => setPasskey(e.target.value)}
              autoComplete="new-password"
            />
          </FormField>
          <FormField label="Confirm passkey">
            <input
              className={inputClass}
              type="password"
              value={confirmPasskey}
              onChange={(e) => setConfirmPasskey(e.target.value)}
              autoComplete="new-password"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreatePasskey(); }}
            />
          </FormField>
          {error && <p className="text-xs text-[#f31260]">{error}</p>}
          <button
            onClick={handleCreatePasskey}
            disabled={busy}
            className="w-full bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save Passkey"}
          </button>
        </div>
      </div>
    );
  }

  // Locked out from repeated failed attempts.
  if (status.lockedUntil) {
    return (
      <div className="flex flex-col items-center justify-center text-center border border-dashed border-[#eaeaea] rounded-xl py-20 max-w-md mx-auto">
        <Lock className="w-8 h-8 text-[#f31260] mb-3" />
        <p className="text-sm font-medium text-[#0a0a0a]">Vault temporarily locked</p>
        <p className="text-xs text-[#999] mt-1">Too many incorrect attempts. Try again shortly, or reset your passkey below.</p>
        <button onClick={() => setForgotMode(true)} className="mt-4 text-xs text-[#0070f3] hover:underline">
          Forgot your passkey?
        </button>
      </div>
    );
  }

  // Normal unlock screen.
  return (
    <div className="max-w-sm mx-auto border border-[#eaeaea] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <Lock className="w-4 h-4 text-[#666]" />
        <p className="text-sm font-semibold text-[#0a0a0a]">Enter your vault passkey</p>
      </div>
      <p className="text-xs text-[#999] mb-4">Unlock to view your stored credentials for this session.</p>
      <div className="space-y-3">
        <FormField label="Passkey">
          <input
            className={inputClass}
            type="password"
            value={passkey}
            onChange={(e) => setPasskey(e.target.value)}
            autoComplete="current-password"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleUnlock(); }}
          />
        </FormField>
        {error && <p className="text-xs text-[#f31260]">{error}</p>}
        <button
          onClick={handleUnlock}
          disabled={busy}
          className="w-full bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
        <button onClick={() => setForgotMode(true)} className="w-full text-xs text-[#999] hover:text-[#666] underline">
          Forgot your passkey?
        </button>
      </div>
    </div>
  );
}
