/**
 * The tags a text conversation can carry.
 *
 * A fixed set rather than free text, because a tag only earns its place if
 * somebody else can filter by it - and "follow up", "Follow-Up" and
 * "followup" are three tags that each find a third of the threads.
 *
 * Colours are drawn from the palette app/globals.css already darkens for
 * the dark theme. A hex outside that list silently keeps its light
 * background at night, which is how a tidy page becomes an unreadable one.
 */
export interface MessageTag {
  key: string;
  label: string;
  /** Tailwind classes for the chip, light and dark both handled. */
  className: string;
  /** The dot used where there isn't room for the whole chip. */
  dot: string;
}

export const MESSAGE_TAGS: MessageTag[] = [
  { key: "urgent",    label: "Urgent",    className: "bg-[#fef2f2] text-[#b91c1c]", dot: "bg-[#f31260]" },
  { key: "follow-up", label: "Follow up", className: "bg-[#fff7e6] text-[#92400e]", dot: "bg-[#f5a524]" },
  { key: "support",   label: "Support",   className: "bg-[#eff6ff] text-[#0070f3]", dot: "bg-[#0070f3]" },
  { key: "billing",   label: "Billing",   className: "bg-[#f3e8ff] text-[#7c3aed]", dot: "bg-[#7c3aed]" },
  { key: "sales",     label: "Sales",     className: "bg-[#f0fdf4] text-[#15803d]", dot: "bg-[#17c964]" },
  { key: "resolved",  label: "Resolved",  className: "bg-[#f5f5f5] text-[#666]",    dot: "bg-[#999]" },
];

export const TAG_BY_KEY: Record<string, MessageTag> = Object.fromEntries(
  MESSAGE_TAGS.map((t) => [t.key, t]),
);

/** Only tags we know about, in the order they are defined. */
export function knownTags(keys: string[] | undefined): MessageTag[] {
  if (!keys?.length) return [];
  return MESSAGE_TAGS.filter((t) => keys.includes(t.key));
}
