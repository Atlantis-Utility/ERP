"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * A popover that escapes its container.
 *
 * An absolutely positioned menu is fine in a form, but not in the call sheet:
 * its cells sit inside an overflow-auto viewport, which clips the menu at the
 * edge of the table and scrolls the table when the menu is taller than what's
 * left. Rendering into the body and positioning against the trigger is the
 * only way a dropdown in a scrollable grid can open over its surroundings.
 *
 * Opening upwards when there isn't room below is what makes the last few rows
 * of a long sheet usable at all.
 */
export default function FloatingLayer({
  anchorRef,
  width = "anchor",
  minWidth = 160,
  onClose,
  children,
}: {
  /**
   * The trigger, passed as a ref rather than an element: reading .current
   * during the parent's render would be reading a ref mid-render, which
   * isn't guaranteed to be populated and doesn't re-render when it changes.
   */
  anchorRef: RefObject<HTMLElement | null>;
  /** "anchor" matches the trigger's width, a number is a width in pixels. */
  width?: "anchor" | number;
  minWidth?: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // Held in a ref so a caller passing an inline arrow (most of them) doesn't
  // tear down and re-register the listeners on every one of its renders.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    // Positioning runs in a frame callback rather than in the effect body:
    // the box has to be in the document before its height can be measured,
    // and that height decides whether it opens up or down.
    const place = () => {
      const box = boxRef.current;
      const rect = anchor.getBoundingClientRect();
      const w = Math.max(width === "anchor" ? rect.width : width, minWidth);
      const height = box?.offsetHeight ?? 0;
      const gap = 4;
      const below = window.innerHeight - rect.bottom - gap;
      const above = rect.top - gap;
      const flip = height > below && above > below;

      setStyle({
        position: "fixed",
        left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - w - 8)),
        width: w,
        maxHeight: Math.max(160, (flip ? above : below) - 8),
        ...(flip ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
      });
    };

    let frame = requestAnimationFrame(() => {
      place();
      // A second pass once the box has been laid out at its natural height,
      // which is what the up/down decision needs.
      frame = requestAnimationFrame(place);
    });

    // Arrows, not function declarations: a hoisted declaration doesn't see
    // the null check above it, so `anchor` would be optional in there.
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!boxRef.current?.contains(target) && !anchor.contains(target)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape belongs to the topmost thing open, and that's this menu. The
      // dialog underneath listens on the document too, so without stopping
      // here one press would close both: capture runs before the document's
      // bubble listeners, so this claims the key first.
      e.stopPropagation();
      closeRef.current();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    // Capture, so the menu keeps up with the cell when the sheet itself is
    // scrolled and not just the window.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef, width, minWidth]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={boxRef}
      // Hidden until measured, so nothing appears in the wrong place for a frame.
      style={style ?? { position: "fixed", top: 0, left: 0, opacity: 0, pointerEvents: "none" }}
      className="z-[60] overflow-y-auto overscroll-contain"
    >
      {children}
    </div>,
    document.body,
  );
}
