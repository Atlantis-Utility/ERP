import { logActivity } from "./activity-log";
import { hasPageAccess } from "./nav-pages";

export type NotifIcon = "user" | "project" | "network" | "phone" | "system" | "leave";

export interface AppNotification {
  id: string;
  prefId: string;       // matches settings pref id: "n-1" … "n-7"
  icon: NotifIcon;
  title: string;
  body: string;
  userId: string | null; // null = admin
  timestamp: string;
  read: boolean;
  href?: string;
  ticketId?: string;
}

const STORAGE_KEY = "app_notifications";
const MAX_ENTRIES = 200;

// prefId used for auto-generated "new ticket arrived" notifications
export const TICKET_NOTIF_PREF_ID = "new-ticket";

/**
 * The page a notification is about, so it can be withheld from somebody who
 * doesn't hold that page. "A site went offline" is a sentence about the
 * UniFi network, and telling it to a caller who has only Leads tells them
 * something about a system they can't open and can't act on.
 *
 * Every notification carries an href today, which already names the page:
 * /projects/abc is about Projects. The prefId map is the fallback for one
 * raised without a link, and a notification that resolves to no page at all
 * is nobody's in particular and stays visible.
 */
const PAGE_BY_PREF: Record<string, string> = {
  "n-1": "/employees",
  "n-2": "/projects",
  "n-6": "/sites",
  "n-7": "/alerts",
  [TICKET_NOTIF_PREF_ID]: "/tickets",
};

export function notificationPage(n: { prefId: string; href?: string }): string | null {
  return n.href ?? PAGE_BY_PREF[n.prefId] ?? null;
}

/**
 * `access` is the viewer's page grants, with `undefined` meaning
 * unrestricted — the same convention as lib/nav-pages.
 */
export function canSeeNotification(n: { prefId: string; href?: string }, access: string[] | undefined): boolean {
  const page = notificationPage(n);
  return page === null || hasPageAccess(page, access);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function readAll(): AppNotification[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}

function writeAll(all: AppNotification[]) {
  // Same reasoning as activity-log's writeAll: a full localStorage quota here
  // must never bubble up into whatever caller just finished a real save.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, MAX_ENTRIES)));
  } catch (err) {
    console.error("[notifications] Failed to persist entry:", err);
  }
}

function isPrefEnabled(prefId: string): boolean {
  try {
    const prefs = JSON.parse(localStorage.getItem("settings_notifs") ?? "null");
    if (!Array.isArray(prefs)) return true;
    const pref = prefs.find((p: { id: string }) => p.id === prefId);
    return pref ? pref.enabled : true;
  } catch { return true; }
}

function currentUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("current_user_id");
}

// ── Public API ────────────────────────────────────────────────────────────────

export function addNotification(params: {
  prefId: string;
  icon: NotifIcon;
  title: string;
  body: string;
  href?: string;
  ticketId?: string;
}): void {
  if (!isPrefEnabled(params.prefId)) return;

  const entry: AppNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    prefId: params.prefId,
    icon: params.icon,
    title: params.title,
    body: params.body,
    userId: currentUserId(),
    timestamp: new Date().toISOString(),
    read: false,
    href: params.href,
    ticketId: params.ticketId,
  };

  writeAll([entry, ...readAll()]);

  // Also persist to activity log so it appears in Logs > Notifications
  const page = notificationPage(params);
  logActivity({
    category: "notification",
    action: params.title,
    detail: params.body,
    // Carried so the Logs feed can withhold the same entries the panel
    // does, since a log line has no href of its own.
    metadata: page ? { page } : undefined,
  });

  // Notify same-tab listeners (dashboard updates without reload)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app-notification", { detail: entry }));
  }
}

/**
 * The current user's notifications (admin sees admin's own; employee sees
 * theirs), minus anything about a page they don't hold. Callers pass the
 * viewer's grants from auth-context; leaving it out means unrestricted.
 */
export function getNotifications(access?: string[]): AppNotification[] {
  const uid = currentUserId();
  return readAll().filter((n) => n.userId === uid && canSeeNotification(n, access));
}

export function getUnreadCount(access?: string[]): number {
  return getNotifications(access).filter((n) => !n.read).length;
}

export function getUnreadCountByPrefId(prefId: string, access?: string[]): number {
  return getNotifications(access).filter((n) => !n.read && n.prefId === prefId).length;
}

/** Whether the current user has an unread "new ticket" notification for this specific ticket. */
export function isTicketUnread(ticketId: string): boolean {
  return getNotifications().some((n) => !n.read && n.prefId === TICKET_NOTIF_PREF_ID && n.ticketId === ticketId);
}

/** Marks the current user's "new ticket" notification(s) for this specific ticket as read. */
export function markTicketRead(ticketId: string): void {
  const uid = currentUserId();
  writeAll(readAll().map((n) =>
    n.userId === uid && n.prefId === TICKET_NOTIF_PREF_ID && n.ticketId === ticketId ? { ...n, read: true } : n
  ));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app-notification"));
  }
}

/**
 * One-time cleanup for ticket notifications created before per-ticket tracking
 * existed (no ticketId, so markTicketRead can never reach them) — otherwise
 * they'd sit unread forever and permanently inflate the sidebar badge.
 */
export function markLegacyTicketNotificationsRead(): void {
  const uid = currentUserId();
  writeAll(readAll().map((n) =>
    n.userId === uid && n.prefId === TICKET_NOTIF_PREF_ID && !n.ticketId ? { ...n, read: true } : n
  ));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app-notification"));
  }
}

export function markAllReadByPrefId(prefId: string): void {
  const uid = currentUserId();
  writeAll(readAll().map((n) => (n.userId === uid && n.prefId === prefId ? { ...n, read: true } : n)));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app-notification"));
  }
}

export function markRead(id: string): void {
  writeAll(readAll().map((n) => (n.id === id ? { ...n, read: true } : n)));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app-notification"));
  }
}

export function markAllRead(): void {
  const uid = currentUserId();
  writeAll(readAll().map((n) => (n.userId === uid ? { ...n, read: true } : n)));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app-notification"));
  }
}

export function clearAll(): void {
  const uid = currentUserId();
  writeAll(readAll().filter((n) => n.userId !== uid));
}
