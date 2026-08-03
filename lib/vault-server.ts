import type { VaultEntryMeta } from "./vault-types";

// Server-only helpers shared across the /api/vault route handlers.
export const VAULT_TABLE = "vault_entries";
export const VAULT_AUDIT_TABLE = "vault_audit_log";
export const VAULT_SHARES_TABLE = "vault_shares";
export const VAULT_PASSKEYS_TABLE = "vault_passkeys";

// `ownerUid`/`ownerName`/`isOwner`/`isAdminView`/`shareCount` are filled in
// by the caller (they depend on who's asking and aren't stored per-row in a
// way this generic mapper can see), defaulted here so every call site
// doesn't have to repeat the same boilerplate for fields it doesn't care about.
export function toVaultMeta(row: Record<string, unknown>): VaultEntryMeta {
  return {
    id: row.id as string,
    name: row.name as string,
    accountId: (row.account_id as string) ?? undefined,
    email: (row.email as string) ?? undefined,
    website: (row.website as string) ?? undefined,
    phoneNumbers: (row.phone_numbers as string[]) ?? [],
    pointsOfContact: (row.points_of_contact as string[]) ?? [],
    category: row.category as VaultEntryMeta["category"],
    notes: (row.notes as string) ?? undefined,
    tags: (row.tags as string[]) ?? [],
    hasPin: !!row.pin_ciphertext,
    customerId: (row.customer_id as string) ?? undefined,
    customerName: (row.customer_name as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    createdBy: row.created_by as string,
    updatedBy: row.updated_by as string,
    lastRevealedAt: (row.last_revealed_at as string) ?? undefined,
    lastRevealedBy: (row.last_revealed_by as string) ?? undefined,
    ownerUid: (row.owner_uid as string) ?? null,
    ownerName: "",
    isOwner: false,
    isAdminView: false,
  };
}

export async function logVaultAudit(
  supabase: Awaited<ReturnType<typeof import("./supabase/server").createClient>>,
  params: {
    action:
      | "create" | "update" | "delete" | "reveal"
      | "share_grant" | "share_revoke"
      | "unlock" | "unlock_failed"
      | "passkey_set" | "passkey_reset";
    entryId: string;
    entryName: string;
    actorUid: string;
    actorEmail: string;
  }
): Promise<void> {
  await supabase.from(VAULT_AUDIT_TABLE).insert({
    action: params.action,
    entry_id: params.entryId,
    entry_name: params.entryName,
    actor_uid: params.actorUid,
    actor_email: params.actorEmail,
  });
}
