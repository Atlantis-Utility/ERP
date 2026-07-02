
export type LogCategory =
  | "auth"
  | "employees"
  | "projects"
  | "settings"
  | "access"
  | "network"
  | "system"
  | "notification";

export interface ActivityLogEntry {
  id: string;
  userId: string | null;    // null = admin
  userName: string;
  category: LogCategory;
  action: string;           // short title e.g. "Added employee"
  detail: string;           // full human-readable description
  timestamp: string;
  metadata?: Record<string, string | number | boolean>;
}

const KEY = "activity_log";
const MAX = 500;

// ── Internals ─────────────────────────────────────────────────────────────────

function readAll(): ActivityLogEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); }
  catch { return []; }
}

function writeAll(entries: ActivityLogEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
}

function resolveUser(): { id: string | null; name: string } {
  if (typeof window === "undefined") return { id: null, name: "Admin" };
  const id = localStorage.getItem("current_user_id");
  if (!id) {
    const adminName = localStorage.getItem("current_user_name") ?? "Admin";
    return { id: null, name: adminName };
  }
  // Name is stored in localStorage by the auth context on login
  const name = localStorage.getItem("current_user_name") ?? `User (${id.slice(0, 8)})`;
  return { id, name };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function logActivity(params: {
  category: LogCategory;
  action: string;
  detail: string;
  metadata?: Record<string, string | number | boolean>;
}): void {
  if (typeof window === "undefined") return;

  const user = resolveUser();
  const entry: ActivityLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: user.id,
    userName: user.name,
    category: params.category,
    action: params.action,
    detail: params.detail,
    timestamp: new Date().toISOString(),
    metadata: params.metadata,
  };

  writeAll([entry, ...readAll()]);

  // Let the log page refresh in real-time
  window.dispatchEvent(new CustomEvent("activity-log-entry", { detail: entry }));
}

export function getLogs(): ActivityLogEntry[] {
  return readAll();
}

export function clearLogs(): void {
  writeAll([]);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("activity-log-entry"));
  }
}

export function getLogCount(): number {
  return readAll().length;
}
