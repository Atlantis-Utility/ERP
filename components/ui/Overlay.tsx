"use client";

import { useEffect, type ReactNode } from "react";

/**
 * The backdrop a modal sits on, which dismisses it.
 *
 * Twelve of the app's nineteen overlays had no way out but their own X, so
 * clicking beside one did nothing and Escape did nothing. Both are reflexes,
 * and a dialog that ignores them feels stuck.
 *
 * The click test is `target === currentTarget`, so only the backdrop itself
 * counts. The alternative, stopping propagation on the panel, breaks
 * anything inside that legitimately listens on the document, which in this
 * app includes every Select and date picker.
 */
export default function Overlay({
  onDismiss,
  className,
  children,
  dismissable = true,
}: {
  onDismiss: () => void;
  /** The backdrop's own classes, so each modal keeps its own look. */
  className: string;
  children: ReactNode;
  /**
   * False while something is mid-flight, so a stray click can't close a
   * dialog that is busy writing.
   */
  dismissable?: boolean;
}) {
  useEffect(() => {
    if (!dismissable) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss, dismissable]);

  return (
    <div
      className={className}
      onClick={(e) => {
        if (dismissable && e.target === e.currentTarget) onDismiss();
      }}
    >
      {children}
    </div>
  );
}
