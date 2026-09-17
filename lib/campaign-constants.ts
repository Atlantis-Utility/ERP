// Shared across the campaign list, the create dialog, and the call sheet.
import type { CampaignStatus } from "./db/campaigns";

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
 * Suggestions for "Interested In (Service)". A datalist rather than a fixed
 * select: callers hear things that don't fit a list, and losing that detail
 * to the nearest dropdown option would be worse than inconsistent values.
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
