"use client";

import type { ReactNode } from "react";

/**
 * A hover label, for the places where a `title` attribute isn't enough.
 *
 * The native one waits about a second before appearing and can't be styled,
 * which is fine for an icon button but not for something whose whole purpose
 * is to be read, like the faces on a campaign row: pointing at one should say
 * who it is straight away.
 *
 * CSS only, on purpose. No state, no positioning library, nothing to mount:
 * it costs nothing to put one on every avatar in a list.
 *
 * The group is named `tooltip` because the rows these sit in already use the
 * unnamed `group` for their own hover states, and an unnamed nested group
 * would answer to that one too.
 */
export default function Tooltip({
  label,
  children,
  side = "top",
  className = "",
}: {
  /** One line, or several: an array renders a line each. */
  label: string | string[];
  children: ReactNode;
  side?: "top" | "bottom";
  /** Applied to the wrapper, which is inline-flex. */
  className?: string;
}) {
  const lines = Array.isArray(label) ? label.filter(Boolean) : [label];
  if (lines.length === 0) return <>{children}</>;

  return (
    <span className={`group/tooltip relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#0a0a0a] px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 ${
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
        }`}
      >
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </span>
    </span>
  );
}
