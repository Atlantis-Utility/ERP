"use client";

import type { VaultEntryMeta, VaultEntryInput, VaultEntryUpdateInput, VaultShareInfo, VaultPasskeyStatus } from "../vault-types";

// All vault reads/writes go through /api/vault (Supabase service running
// under RLS + app-level auth checks on the server) rather than the Supabase
// client SDK directly. The session cookie rides along with same-origin
// fetch automatically, no manual auth header needed.

export class VaultApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function isVaultLockedError(err: unknown): boolean {
  return err instanceof VaultApiError && err.status === 423;
}

async function parseError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const data = await res.json();
    if (data?.error) message = data.error;
  } catch {}
  throw new VaultApiError(message, res.status);
}

export async function listVaultEntries(): Promise<VaultEntryMeta[]> {
  const res = await fetch("/api/vault");
  if (!res.ok) return parseError(res, "Failed to load vault");
  const data = await res.json();
  return data.entries as VaultEntryMeta[];
}

export async function createVaultEntry(input: VaultEntryInput): Promise<VaultEntryMeta> {
  const res = await fetch("/api/vault", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return parseError(res, "Failed to create entry");
  const data = await res.json();
  return data.entry as VaultEntryMeta;
}

export async function updateVaultEntry(id: string, patch: VaultEntryUpdateInput): Promise<VaultEntryMeta> {
  const res = await fetch(`/api/vault/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return parseError(res, "Failed to update entry");
  const data = await res.json();
  return data.entry as VaultEntryMeta;
}

export async function deleteVaultEntry(id: string): Promise<void> {
  const res = await fetch(`/api/vault/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) return parseError(res, "Failed to delete entry");
}

export async function revealVaultPassword(id: string): Promise<{ password: string; pin: string | null; revealedAt: string }> {
  const res = await fetch(`/api/vault/${encodeURIComponent(id)}/reveal`, { method: "POST" });
  if (!res.ok) return parseError(res, "Failed to reveal password");
  return res.json();
}

// ── Sharing ──────────────────────────────────────────────────────────────

export async function listVaultShares(entryId: string): Promise<{ shares: VaultShareInfo[]; isOwner: boolean }> {
  const res = await fetch(`/api/vault/${encodeURIComponent(entryId)}/shares`);
  if (!res.ok) return parseError(res, "Failed to load access list");
  return res.json();
}

export async function grantVaultShare(entryId: string, employeeId: string): Promise<{ granteeUid: string; granteeName: string }> {
  const res = await fetch(`/api/vault/${encodeURIComponent(entryId)}/shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId }),
  });
  if (!res.ok) return parseError(res, "Failed to share entry");
  return res.json();
}

export async function revokeVaultShare(entryId: string, granteeUid: string): Promise<void> {
  const res = await fetch(`/api/vault/${encodeURIComponent(entryId)}/shares/${encodeURIComponent(granteeUid)}`, { method: "DELETE" });
  if (!res.ok) return parseError(res, "Failed to revoke access");
}

// ── Passkey / unlock ─────────────────────────────────────────────────────

export async function getVaultPasskeyStatus(): Promise<VaultPasskeyStatus> {
  const res = await fetch("/api/vault/passkey");
  if (!res.ok) return parseError(res, "Failed to load vault status");
  return res.json();
}

export async function setVaultPasskey(newPasskey: string, currentPasskey?: string): Promise<{ unlockedUntil: string }> {
  const res = await fetch("/api/vault/passkey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPasskey, currentPasskey }),
  });
  if (!res.ok) return parseError(res, "Failed to set passkey");
  return res.json();
}

export async function unlockVault(passkey: string): Promise<{ unlockedUntil: string }> {
  const res = await fetch("/api/vault/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passkey }),
  });
  if (!res.ok) return parseError(res, "Failed to unlock vault");
  return res.json();
}

export async function lockVault(): Promise<void> {
  const res = await fetch("/api/vault/lock", { method: "POST" });
  if (!res.ok) return parseError(res, "Failed to lock vault");
}
