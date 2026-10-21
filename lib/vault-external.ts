import crypto from "crypto";
import type { VaultExternalShareInfo, VaultExternalShareStatus } from "./vault-types";

// Server-only. Links for sharing a vault entry with someone outside the
// organisation; see supabase/migration-vault-external-shares.sql.

/**
 * A fresh link token and the hash that gets stored. 32 random bytes, so
 * guessing one is not a thing anybody can do; base64url so it survives
 * being pasted out of an email without anything escaping it.
 */
export function newShareToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: hashShareToken(token) };
}

export function hashShareToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** A token shaped like one newShareToken makes, before touching the database. */
export function isPlausibleShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function externalShareStatus(row: Record<string, unknown>, now = Date.now()): VaultExternalShareStatus {
  if (row.revoked_at) return "revoked";
  if (new Date(row.expires_at as string).getTime() <= now) return "expired";
  const max = row.max_views as number | null;
  if (max !== null && (row.view_count as number) >= max) return "used_up";
  return "active";
}

export function viewsLeft(row: Record<string, unknown>): number | null {
  const max = row.max_views as number | null;
  return max === null ? null : Math.max(0, max - (row.view_count as number));
}

export function toExternalShareInfo(row: Record<string, unknown>, createdByName: string): VaultExternalShareInfo {
  return {
    id: row.id as string,
    recipientEmail: row.recipient_email as string,
    recipientName: (row.recipient_name as string) ?? undefined,
    message: (row.message as string) ?? undefined,
    includeNotes: !!row.include_notes,
    expiresAt: row.expires_at as string,
    maxViews: (row.max_views as number | null) ?? null,
    viewCount: (row.view_count as number) ?? 0,
    lastViewedAt: (row.last_viewed_at as string) ?? undefined,
    createdAt: row.created_at as string,
    createdByName,
    revokedAt: (row.revoked_at as string) ?? undefined,
    status: externalShareStatus(row),
  };
}

/**
 * "Thursday, October 23 at 3:00 PM EDT", in the sender's zone when the
 * browser told us it, otherwise UTC, which at least says which zone it is.
 */
export function formatExpiry(iso: string, timeZone?: string): string {
  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : "UTC";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
    timeZoneName: "short",
  })
    .format(new Date(iso))
    .replace(/, (\d{1,2}:\d{2})/, " at $1");
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
