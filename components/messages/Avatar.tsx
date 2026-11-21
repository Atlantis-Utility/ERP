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

export default function Avatar({
  name,
  tone = "light",
  size = "md",
}: {
  name: string;
  /** "dark" marks our own side of a conversation. */
  tone?: "light" | "dark";
  size?: "sm" | "md";
}) {
  const dimensions = size === "sm" ? "w-6 h-6 text-[9px]" : "w-8 h-8 text-[11px]";
  // Our side picks up the same blue as our messages; everybody else is
  // neutral. Both backgrounds are in the set globals.css darkens, so the
  // circles don't stay bright white at night.
  const colours =
    tone === "dark"
      ? "bg-[#eff6ff] text-[#0070f3]"
      : "bg-[#f5f5f5] text-[#666] border border-[#eaeaea]";
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
