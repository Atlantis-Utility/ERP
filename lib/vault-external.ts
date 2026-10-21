import crypto from "crypto";
import type { VaultExternalShareInfo, VaultExternalShareStatus, VaultShareEventKind } from "./vault-types";

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

export const VAULT_SHARE_EVENTS_TABLE = "vault_external_share_events";

/**
 * Writes down that the recipient did something. Never throws: a failed
 * note about a view must not stop the view itself, or the email's image
 * from loading.
 */
export async function recordShareEvent(
  supabase: { from: (table: string) => { insert: (row: Record<string, unknown>) => PromiseLike<{ error: unknown }> } },
  shareId: string,
  kind: VaultShareEventKind,
  req: Request,
): Promise<void> {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
    const { error } = await supabase.from(VAULT_SHARE_EVENTS_TABLE).insert({
      share_id: shareId,
      kind,
      ip,
      user_agent: req.headers.get("user-agent")?.slice(0, 400) ?? null,
    });
    if (error) console.error("[vault:external:event]", error);
  } catch (err) {
    console.error("[vault:external:event]", err);
  }
}

/**
 * "Chrome on Windows", "Safari on iPhone". Enough to tell a phone from a
 * laptop and a person from a mail server's image proxy, which is all the
 * owner needs; not a fingerprint.
 */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "";
  if (/GoogleImageProxy/i.test(ua)) return "Gmail image proxy";
  if (/YahooMailProxy/i.test(ua)) return "Yahoo Mail image proxy";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /Outlook|Microsoft Office/i.test(ua) ? "Outlook"
    : "";
  const os =
    /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac"
    : /Linux/.test(ua) ? "Linux"
    : "";
  // Apple Mail loads images with a bare WebKit agent and no browser name.
  if (!browser && /AppleWebKit/.test(ua) && (os === "Mac" || os === "iPhone" || os === "iPad")) return `Apple Mail on ${os}`;
  if (browser && os) return `${browser} on ${os}`;
  return browser || os;
}

export function toExternalShareInfo(
  row: Record<string, unknown>,
  createdByName: string,
  events: Record<string, unknown>[] = [],
): VaultExternalShareInfo {
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
    notifyOwner: row.notify_owner !== false,
    events: events
      .map((e) => ({
        kind: e.kind as VaultShareEventKind,
        at: e.at as string,
        device: describeDevice(e.user_agent as string | null),
      }))
      .sort((a, b) => a.at.localeCompare(b.at)),
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

/** Same as formatExpiry; named for a moment that has happened. */
export const formatMoment = formatExpiry;

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
