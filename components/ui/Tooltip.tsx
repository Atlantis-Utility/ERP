"use client";

import type { ReactNode } from "react";

/**
 * A hover label on something that can't carry one itself.
 *
 * Most of the app writes `data-tip="…"` straight onto the element — it is
 * one attribute, it replaces `title`, and TooltipLayer draws it. This is for
 * when there is nothing to put it on: a bare `{children}`, a component whose
 * props you don't control, or a run of text that needs wrapping first.
 *
 * It renders a wrapper carrying the same attribute, so there is still only
 * one tooltip in the app and it looks the same everywhere.
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
  const lines = (Array.isArray(label) ? label : [label]).filter(Boolean);
  if (lines.length === 0) return <>{children}</>;

  return (
    <span
      data-tip={lines.join("\n")}
      data-tip-side={side === "bottom" ? "bottom" : undefined}
      className={`inline-flex ${className}`}
    >
      {children}
    </span>
  );
}
