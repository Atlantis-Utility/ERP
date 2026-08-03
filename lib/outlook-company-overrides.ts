// Outlook events aren't backed by our own database — they're fetched live from
// Microsoft on every request — so a manual "this is actually XYZ Corp" company
// correction, or free-text notes, have nowhere else to live. Store both
// client-side, keyed by event id.
const COMPANY_KEY = "outlook_company_overrides";
const NOTES_KEY = "outlook_notes_overrides";

export interface OutlookNote {
  id: string;
  text: string;
  createdAt: string;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function getCompanyOverride(eventId: string): string | null {
  const all = readJson<Record<string, string>>(COMPANY_KEY, {});
  return all[eventId] ?? null;
}

export function setCompanyOverride(eventId: string, company: string): void {
  const all = readJson<Record<string, string>>(COMPANY_KEY, {});
  const trimmed = company.trim();
  if (trimmed) all[eventId] = trimmed;
  else delete all[eventId];
  writeJson(COMPANY_KEY, all);
}

// Notes are additive — a running log per event, not a single overwritable
// blob, so earlier notes are never lost when someone adds a new one.
export function getNotesOverride(eventId: string): OutlookNote[] {
  const all = readJson<Record<string, OutlookNote[]>>(NOTES_KEY, {});
  return all[eventId] ?? [];
}

export function addNoteOverride(eventId: string, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const all = readJson<Record<string, OutlookNote[]>>(NOTES_KEY, {});
  const existing = all[eventId] ?? [];
  all[eventId] = [...existing, { id: `note-${Date.now()}`, text: trimmed, createdAt: new Date().toISOString() }];
  writeJson(NOTES_KEY, all);
}

export function removeNoteOverride(eventId: string, noteId: string): void {
  const all = readJson<Record<string, OutlookNote[]>>(NOTES_KEY, {});
  const existing = all[eventId] ?? [];
  all[eventId] = existing.filter((n) => n.id !== noteId);
  writeJson(NOTES_KEY, all);
}
