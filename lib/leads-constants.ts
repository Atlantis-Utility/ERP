// Shared across the Leads page, the stage board, the add-lead form, and
// the lead detail drawer, so the stage list/styling only needs to change in
// one place.
import { Circle, PhoneCall, Clock, ThumbsUp, CalendarCheck, ThumbsDown, Ban, type LucideIcon } from "lucide-react";
import type { LeadStatus, LeadPriority, LeadSource } from "./db/leads";

export const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "follow_up", label: "Follow Up" },
  { value: "interested", label: "Interested" },
  { value: "appointment", label: "Book an Appointment" },
  { value: "not_interested", label: "Not Interested" },
  { value: "do_not_call", label: "Do Not Call" },
];

export const STATUS_LABELS: Record<LeadStatus, string> = STATUS_OPTIONS.reduce(
  (acc, s) => ({ ...acc, [s.value]: s.label }),
  {} as Record<LeadStatus, string>,
);

/**
 * Closed: the lead is done with, so no more follow-up chasing and it stops
 * counting as open work. "Book an Appointment" is deliberately NOT terminal, * the appointment still has to happen, and dropping it out of the active list
 * is how a booked call gets forgotten.
 */
export const TERMINAL_STATUSES: LeadStatus[] = ["not_interested", "do_not_call"];

export const isTerminalStatus = (status: LeadStatus): boolean => TERMINAL_STATUSES.includes(status);

// Every bg hex here is darkened by the allowlist in app/globals.css, the app
// has no `dark:` variants, so a colour that isn't listed there silently stays
// light-on-light in dark mode.
export const STATUS_STYLES: Record<LeadStatus, string> = {
  // Grey for "nobody has touched it", colour for the stages that mean
  // something was said, red only for the one that's an instruction.
  new: "bg-[#f1f1f1] text-[#666]",
  contacted: "bg-[#eff6ff] text-[#0070f3]",
  follow_up: "bg-[#fefce8] text-[#f5a524]",
  interested: "bg-[#ecfeff] text-[#0891b2]",
  appointment: "bg-[#f0fdf4] text-[#17c964]",
  not_interested: "bg-[#f5f5f5] text-[#999]",
  do_not_call: "bg-[#fef2f2] text-[#f31260]",
};

// Solid dot color per stage, used in the StatusPicker dropdown menu and the
// board column headers (the pill itself uses the softer bg/text pair above).
/**
 * One glyph per stage, so a stage reads at a glance without leaning on colour
 * alone, which also means it still reads for anyone who can't separate the
 * amber from the cyan. Monochrome wherever it appears; the pill's own colour
 * carries the emphasis.
 */
/**
 * Icon colour per stage, for the places the icon sits on a plain background
 * (the stage board's column headers, the stage menu). Monochrome grey read as
 * switched-off; this is the same accent each stage's pill already uses, so
 * the two agree and the board scans by colour as well as by position.
 */
export const STATUS_ICON_COLORS: Record<LeadStatus, string> = {
  new: "text-[#bbb]",
  contacted: "text-[#0070f3]",
  follow_up: "text-[#f5a524]",
  interested: "text-[#0891b2]",
  appointment: "text-[#17c964]",
  not_interested: "text-[#999]",
  do_not_call: "text-[#f31260]",
};

export const STATUS_ICONS: Record<LeadStatus, LucideIcon> = {
  new: Circle,
  contacted: PhoneCall,
  follow_up: Clock,
  interested: ThumbsUp,
  appointment: CalendarCheck,
  not_interested: ThumbsDown,
  do_not_call: Ban,
};

/**
 * The stages a person can actually move a lead *to*. "New" is excluded on
 * purpose: it means "nobody has touched this yet", which isn't something you
 * choose, it's where a lead starts. It stays available as a filter, and
 * still renders as a badge on untouched leads.
 */
export const SETTABLE_STATUS_OPTIONS = STATUS_OPTIONS.filter((s) => s.value !== "new");

export const PRIORITY_OPTIONS: { value: LeadPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const PRIORITY_STYLES: Record<LeadPriority, string> = {
  high: "bg-[#fef2f2] text-[#f31260]",
  medium: "bg-[#fefce8] text-[#f5a524]",
  low: "bg-[#f1f1f1] text-[#666]",
};

export const SOURCE_LABELS: Record<LeadSource, string> = {
  azure_maps: "Azure Maps",
  linkedin_csv: "LinkedIn",
  manual: "Manual",
};

export const SOURCE_OPTIONS = (Object.keys(SOURCE_LABELS) as LeadSource[]).map((value) => ({
  value,
  label: SOURCE_LABELS[value],
}));

// A follow-up date only counts as "overdue" while the lead is still open, a
// won/lost/unqualified lead with a stale date isn't actionable anymore.
export function isFollowUpOverdue(followUpDate: string | undefined, status: LeadStatus): boolean {
  if (!followUpDate || isTerminalStatus(status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(followUpDate) < today;
}

/** Joins the structured street/city/state/zip fields into one display line. */
export function formatAddress(parts: { street?: string; city?: string; state?: string; zip?: string }): string {
  const cityStateZip = [parts.city, [parts.state, parts.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [parts.street, cityStateZip].filter(Boolean).join(", ");
}

// Counts across all leads (converted, overdue, gone-quiet, unassigned) are
// computed by leads_stats() in the database rather than here. At ten thousand
// leads the client only ever holds one page, so there's nothing local to
// reduce over.
