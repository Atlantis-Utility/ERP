// Shared across the Leads page, the add-lead form, and the lead detail
// drawer, so the status list/styling only needs to change in one place.
import type { LeadStatus } from "./db/leads";

export const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "unqualified", label: "Unqualified" },
  { value: "converted", label: "Converted" },
];

export const STATUS_STYLES: Record<LeadStatus, string> = {
  new: "bg-[#e8f2ff] text-[#0070f3]",
  contacted: "bg-[#fff7e6] text-[#f5a524]",
  qualified: "bg-[#f0fdf4] text-[#17c964]",
  unqualified: "bg-[#f1f1f1] text-[#666]",
  converted: "bg-[#f3e8ff] text-[#7c3aed]",
};

// Solid dot color per status, used in the StatusPicker dropdown menu (the
// pill itself uses the softer bg/text pair above).
export const STATUS_DOT_COLORS: Record<LeadStatus, string> = {
  new: "bg-[#0070f3]",
  contacted: "bg-[#f5a524]",
  qualified: "bg-[#17c964]",
  unqualified: "bg-[#999]",
  converted: "bg-[#7c3aed]",
};

// A follow-up date only counts as "overdue" while the lead is still active,
// a converted/unqualified lead with a stale date isn't actionable anymore.
export function isFollowUpOverdue(followUpDate: string | undefined, status: LeadStatus): boolean {
  if (!followUpDate || status === "converted" || status === "unqualified") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(followUpDate) < today;
}

// Joins the structured street/city/state/zip fields into one display line,
// gracefully handling whichever pieces are actually present.
export function formatAddress(parts: { street?: string; city?: string; state?: string; zip?: string }): string {
  const cityStateZip = [parts.city, [parts.state, parts.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [parts.street, cityStateZip].filter(Boolean).join(", ");
}
