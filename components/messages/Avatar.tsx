"use client";

/**
 * Who a message is from, in the space of a circle.
 *
 * Initials for anybody with a name, the last two digits for a number
 * nobody has named. The full name is on the tooltip rather than under it,
 * because the name repeated beside fifty bubbles is noise and the one
 * time you need it you are already pointing at it.
 */
export function initialsFor(name: string): string {
  const clean = (name ?? "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim();
  const words = clean.split(/\s+/).filter((w) => /\p{L}/u.test(w));

  // Nothing but digits: a number nobody has named. Its last two digits
  // tell two such rows apart, where a row of identical "#" circles does
  // not - and a list of texts is mostly numbers.
  if (words.length === 0) {
    const digits = clean.replace(/\D/g, "");
    return digits.length >= 2 ? digits.slice(-2) : "#";
  }

  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  // First and last for a person ("Cyril Obishai" -> CO), first two for
  // anything longer, because a company's last word is its legal suffix:
  // "HQ Atlantis Utility Inc." is HA, not HI.
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * The colours a circle can take.
 *
 * Every background here is one app/globals.css darkens for the dark
 * theme; a prettier hex that isn't on that list stays bright white at
 * night and ruins the page it was chosen for. The text colours are left
 * alone by the theme and read on both.
 */
const PALETTE = [
  "bg-[#eff6ff] text-[#0070f3]",
  "bg-[#f0fdf4] text-[#15803d]",
  "bg-[#f3e8ff] text-[#7c3aed]",
  "bg-[#fff7e6] text-[#92400e]",
  "bg-[#ecfeff] text-[#0070f3]",
  "bg-[#fef2f2] text-[#b91c1c]",
];

/**
 * The same person always gets the same colour, on every screen and after
 * every reload - a colour that shuffles is worse than no colour, because
 * the eye learns it and is then wrong.
 */
export function colourFor(name: string): string {
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return "bg-[#f5f5f5] text-[#666]";
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export default function Avatar({
  name,
  tone = "colour",
  size = "md",
}: {
  name: string;
  /** "mono" for places that want the circle to recede. */
  tone?: "colour" | "mono";
  size?: "sm" | "md" | "lg";
}) {
  const dimensions =
    size === "sm" ? "w-6 h-6 text-[9px]"
    : size === "lg" ? "w-12 h-12 text-base"
    : "w-8 h-8 text-[11px]";
  const colours = tone === "mono" ? "bg-[#f5f5f5] text-[#666]" : colourFor(name);
  return (
    <span
      data-tip={name || undefined}
      aria-label={name || undefined}
      className={`${dimensions} ${colours} shrink-0 rounded-full flex items-center justify-center font-semibold tracking-tight select-none`}
    >
      {initialsFor(name)}
    </span>
  );
}
