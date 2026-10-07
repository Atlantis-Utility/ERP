// Shared across the campaign list, the create dialog, and the call sheet.
import type { CampaignStatus, PaletteColor, SheetColumns } from "./db/campaigns";

/**
 * Call outcomes, offered as a fixed list so the sheet can be filtered and
 * counted by them, free text would make "No answer" and "no ans" different
 * outcomes. The sheet still accepts an unrecognised value from an older row
 * and shows it as-is rather than blanking it.
 */
export const CALL_OUTCOMES = [
  "Connected",
  "Voicemail",
  "No answer",
  "Busy",
  "Callback requested",
  "Gatekeeper",
  "Wrong number",
  "Not interested",
  "Do not call",
  "Qualified",
] as const;

export const CALL_OUTCOME_OPTIONS = CALL_OUTCOMES.map((o) => ({ value: o, label: o }));

// Muted by default; only the outcomes that mean something actionable get
// colour, so a full sheet doesn't read like a paint chart. Every hex here is
// in the dark-mode allowlist in app/globals.css.
export const CALL_OUTCOME_STYLES: Record<string, string> = {
  Connected: "bg-[#eff6ff] text-[#0070f3]",
  Qualified: "bg-[#f0fdf4] text-[#17c964]",
  "Callback requested": "bg-[#fefce8] text-[#f5a524]",
  "Not interested": "bg-[#f1f1f1] text-[#666]",
  "Do not call": "bg-[#fef2f2] text-[#f31260]",
};

/**
 * Suggestions for "Interested In (Service)". Offered as a dropdown with a
 * Custom entry rather than a fixed list: callers hear things that don't fit
 * a list, and losing that detail to the nearest option would be worse than
 * the odd one-off value.
 */
export const SERVICE_SUGGESTIONS = [
  "VoIP / Phone system",
  "Internet / Fiber",
  "Wi-Fi / Networking",
  "Cameras / Security",
  "Structured cabling",
  "SIP trunking",
  "Call centre / Queues",
  "Hardware / Handsets",
];

export const SERVICE_OPTIONS = SERVICE_SUGGESTIONS.map((s) => ({ value: s, label: s }));

/**
 * When to call back. The windows people actually say on the phone, with the
 * same Custom escape hatch, so "after the lunch rush" survives.
 */
export const BEST_TIME_SUGGESTIONS = [
  "Morning",
  "Afternoon",
  "Late afternoon",
  "Before 9am",
  "After 4pm",
  "Weekends",
];

export const BEST_TIME_OPTIONS = BEST_TIME_SUGGESTIONS.map((s) => ({ value: s, label: s }));

export const CAMPAIGN_STATUS_OPTIONS: { value: CampaignStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "done", label: "Done" },
];

export const CAMPAIGN_STATUS_STYLES: Record<CampaignStatus, string> = {
  active: "bg-[#f0fdf4] text-[#17c964]",
  paused: "bg-[#fefce8] text-[#f5a524]",
  done: "bg-[#f1f1f1] text-[#666]",
};

/** Progress through a campaign, as a whole percentage of rows called. */
export function calledPercent(called: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((called / total) * 100);
}

/**
 * The call sheet's columns, in render order: the widths the <colgroup>
 * applies, the headings, and the keys a campaign renames them by.
 *
 * One list rather than three, because the header, the column widths and the
 * rename dialog all have to agree about what the columns are and what order
 * they come in. The cells themselves are still written out one by one — each
 * is a different control — so a column added here needs its cell adding to
 * the sheet too.
 *
 * Width notes: wide enough that the values that matter aren't clipped. The
 * sheet scrolls sideways; that is what the scrollbar is for.
 */
export interface SheetColumnDef {
  key: string;
  label: string;
  width: number;
}

export const SHEET_COLUMNS: SheetColumnDef[] = [
  { key: "no", label: "No.", width: 68 },
  { key: "company", label: "Company Name", width: 232 },
  { key: "address1", label: "Address1", width: 184 },
  { key: "city", label: "City", width: 128 },
  { key: "state", label: "State", width: 64 },
  { key: "zip", label: "Zip", width: 88 },
  { key: "category", label: "Category", width: 168 },
  { key: "phone", label: "Phone", width: 140 },
  { key: "email", label: "Email", width: 184 },
  { key: "contact", label: "Contact Name", width: 176 },
  { key: "callDate", label: "Call Date", width: 148 },
  { key: "attempts", label: "Attempts", width: 76 },
  { key: "outcome", label: "Call Outcome", width: 180 },
  { key: "feedback", label: "Caller Feedback / Prospect's Stated Problem", width: 264 },
  { key: "interested", label: "Interested In (Service)", width: 184 },
  { key: "bestTime", label: "Best Time", width: 148 },
  { key: "followUp", label: "Follow-Up Date", width: 148 },
  { key: "nextAction", label: "Next Action", width: 184 },
  { key: "rep", label: "Assigned Rep", width: 168 },
  { key: "dnc", label: "DNC", width: 52 },
  { key: "notes", label: "Notes", width: 264 },
];

/** The selection column, which only an editor sees. */
export const CHECK_COL_WIDTH = 36;
/** Anything the campaign adds itself. */
export const EXTRA_COL_WIDTH = 184;

/** The heading this campaign wants, or the one the sheet ships with. */
export function columnLabel(columns: SheetColumns | undefined, key: string, fallback: string): string {
  const named = columns?.labels?.[key]?.trim();
  return named || fallback;
}

/**
 * Every column of this campaign's sheet, renames applied and its own
 * columns on the end. Extra columns are keyed "x:<id>" so a key can never
 * collide with a built-in one.
 */
export function sheetColumnsFor(columns: SheetColumns | undefined): SheetColumnDef[] {
  const hidden = hiddenColumns(columns);
  return [
    ...SHEET_COLUMNS.filter((c) => !hidden.has(c.key)).map((c) => ({
      ...c,
      label: columnLabel(columns, c.key, c.label),
    })),
    ...(columns?.extra ?? []).map((c) => ({ key: `x:${c.id}`, label: c.label, width: EXTRA_COL_WIDTH })),
  ];
}

/** Columns this campaign doesn't use. The frozen pane can't be one of them. */
export function hiddenColumns(columns: SheetColumns | undefined): Set<string> {
  const hidden = new Set(columns?.hidden ?? []);
  hidden.delete("no");
  hidden.delete("company");
  return hidden;
}

/** The columns a campaign is allowed to put away. */
export const ALWAYS_SHOWN = new Set(["no", "company"]);

/**
 * The colours a campaign can paint with.
 *
 * A fixed set, not a colour picker: every one of these tints already has a
 * dark-mode counterpart in app/globals.css, and an arbitrary hex would
 * render as a bright block on a dark sheet. A campaign names them — the
 * swatch is the ink, the name is the meaning.
 */
export const SWATCHES: { id: string; label: string; bg: string; dot: string }[] = [
  { id: "amber", label: "Amber", bg: "bg-[#fefce8]", dot: "bg-[#f5a524]" },
  { id: "green", label: "Green", bg: "bg-[#f0fdf4]", dot: "bg-[#17c964]" },
  { id: "blue", label: "Blue", bg: "bg-[#eff6ff]", dot: "bg-[#0070f3]" },
  { id: "red", label: "Red", bg: "bg-[#fef2f2]", dot: "bg-[#f31260]" },
  { id: "violet", label: "Violet", bg: "bg-[#f3e8ff]", dot: "bg-[#7c3aed]" },
  { id: "orange", label: "Orange", bg: "bg-[#fff7e6]", dot: "bg-[#d97706]" },
  { id: "cyan", label: "Cyan", bg: "bg-[#ecfeff]", dot: "bg-[#0891b2]" },
  { id: "grey", label: "Grey", bg: "bg-[#f1f1f1]", dot: "bg-[#999]" },
];

export const SWATCH_BY_ID = new Map(SWATCHES.map((s) => [s.id, s]));

/** The key a whole-row colour is stored under. */
export const ROW_COLOR_KEY = "__row";

/** The tint for a colour this campaign defined, or nothing. */
export function paletteBg(palette: PaletteColor[] | undefined, colorId: string | undefined): string {
  if (!colorId) return "";
  const color = palette?.find((p) => p.id === colorId);
  return (color && SWATCH_BY_ID.get(color.swatch)?.bg) || "";
}

/**
 * Colours ready to use, so naming one is a click rather than a decision.
 *
 * Suggestions, not a fixed scheme: a campaign takes the ones it wants and
 * renames or drops them afterwards, and two campaigns can give the same
 * swatch different jobs — amber is "Follow up" on one sheet and
 * "Interested" on another, because the meaning belongs to the campaign.
 */
export const PRESET_COLORS: { name: string; swatch: string }[] = [
  // The outreach funnel, in the order a row tends to travel it, and one
  // swatch each: two colours wearing the same tint can't be told apart on
  // the sheet, and there are eight tints.
  { name: "Hot lead", swatch: "green" },
  { name: "Follow up", swatch: "amber" },
  { name: "Appointment booked", swatch: "blue" },
  { name: "Emailed, awaiting reply", swatch: "cyan" },
  { name: "Decision maker reached", swatch: "violet" },
  { name: "Gatekeeper", swatch: "orange" },
  { name: "Not interested", swatch: "grey" },
  { name: "Do not call", swatch: "red" },
];
