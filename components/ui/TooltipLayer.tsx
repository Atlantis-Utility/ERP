"use client";

import { useEffect, useRef } from "react";

/**
 * The app's hover labels, in one place.
 *
 * Every `data-tip` in the app is drawn by this: mounted once, it watches the
 * document for a hover or a focus and places a single bubble. One element,
 * one set of listeners, whether the page has three labels or three hundred.
 *
 * It replaces the browser's `title`, which waits the best part of a second,
 * renders in the operating system's font on a yellow slab, ignores the dark
 * theme entirely, and can't be positioned - a tooltip on the right-hand
 * column of a wide table used to open off the edge of the screen.
 *
 * Positioned `fixed` and written to imperatively rather than through state:
 * a label in the call sheet sits inside an `overflow-auto` viewport that
 * would clip an absolutely positioned bubble at the edge of the table, and
 * re-rendering React on every mouse-over to move a 20-pixel box is work
 * nobody asked for.
 */

/** Long enough not to flicker as the pointer crosses a toolbar. */
const DELAY_MS = 180;
/** Between the trigger and the bubble, leaving room for the arrow. */
const GAP = 8;
/** Keeps the bubble off the window edge when a trigger is right against it. */
const EDGE = 8;
/**
 * A disabled button fires no pointer events, so hovering one is silence as
 * far as `pointerover` is concerned - and half the tooltips worth having are
 * on a button that is disabled ("Nothing to undo"). This is the fallback: a
 * hit test, only while nothing is showing, at a rate a human can't tell from
 * instant.
 */
const HIT_TEST_MS = 120;

export default function TooltipLayer() {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const textEl = textRef.current;
    const arrow = arrowRef.current;
    if (!box || !textEl || !arrow) return;

    let timer: number | undefined;
    let shown: HTMLElement | null = null;
    let lastHitTest = 0;

    const hide = () => {
      window.clearTimeout(timer);
      if (shown) {
        // Only ours to remove: a trigger that described itself before we
        // got there keeps whatever it had.
        if (shown.getAttribute("aria-describedby") === "app-tooltip") {
          shown.removeAttribute("aria-describedby");
        }
        shown = null;
      }
      box.dataset.open = "false";
    };

    const place = (el: HTMLElement, text: string) => {
      textEl.textContent = text;
      // Measured, not guessed: the arrow has to point at the trigger and the
      // bubble has to flip when there's no room above, and both of those
      // need the size it actually came out at.
      box.dataset.open = "true";
      box.style.left = "0px";
      box.style.top = "0px";

      const r = el.getBoundingClientRect();
      const w = box.offsetWidth;
      const h = box.offsetHeight;

      let side = el.dataset.tipSide === "bottom" ? "bottom" : "top";
      if (side === "top" && r.top - h - GAP < EDGE) side = "bottom";
      else if (side === "bottom" && r.bottom + h + GAP > window.innerHeight - EDGE) side = "top";

      const top = side === "top" ? r.top - h - GAP : r.bottom + GAP;
      const left = Math.min(
        Math.max(r.left + r.width / 2 - w / 2, EDGE),
        Math.max(window.innerWidth - w - EDGE, EDGE),
      );

      box.style.left = `${Math.round(left)}px`;
      box.style.top = `${Math.round(top)}px`;
      box.dataset.side = side;

      // The arrow tracks the trigger, not the bubble: a label clamped
      // against the right edge of the window still points at its button.
      const arrowX = Math.min(Math.max(r.left + r.width / 2 - left, 12), Math.max(w - 12, 12));
      arrow.style.left = `${Math.round(arrowX)}px`;
    };

    const show = (el: HTMLElement, immediate: boolean) => {
      const text = el.dataset.tip?.trim();
      // `data-tip=""` is a label that resolved to nothing - a row with no
      // note, a cell with no overflow. Nothing to say, so nothing to show.
      if (!text) return;
      if (shown === el) return;

      window.clearTimeout(timer);
      const run = () => {
        shown = el;
        if (!el.hasAttribute("aria-describedby")) el.setAttribute("aria-describedby", "app-tooltip");
        place(el, text);
      };
      // Once one is up, moving along a row of icons should read as one
      // continuous label rather than a wait per icon.
      if (immediate) run();
      else timer = window.setTimeout(run, DELAY_MS);
    };

    const triggerFrom = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null;
      return target.closest<HTMLElement>("[data-tip]");
    };

    const onOver = (e: PointerEvent) => {
      // Touch has no hover: a tap would flash a label and leave it behind.
      if (e.pointerType === "touch") return;
      const el = triggerFrom(e.target);
      if (!el) {
        if (shown) hide();
        return;
      }
      show(el, Boolean(shown));
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || shown) return;
      const now = Date.now();
      if (now - lastHitTest < HIT_TEST_MS) return;
      lastHitTest = now;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const el = hit?.closest<HTMLElement>("[data-tip]");
      if (el) show(el, false);
      else window.clearTimeout(timer);
    };

    const onOut = (e: PointerEvent) => {
      const el = triggerFrom(e.target);
      if (!el) return;
      // Moving onto a child of the same trigger is not leaving it.
      const to = e.relatedTarget;
      if (to instanceof Node && el.contains(to)) return;
      hide();
    };

    const onFocusIn = (e: FocusEvent) => {
      const el = triggerFrom(e.target);
      if (!el) return;
      // A label over the field you are typing in is in the way, and the
      // placeholder already said it.
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      show(el, true);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", hide, true);
    document.addEventListener("keydown", onKey, true);
    // Capture, so a label follows nothing: once the page moves under it the
    // bubble is pointing at the wrong thing.
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", hide, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  return (
    <div
      ref={boxRef}
      id="app-tooltip"
      role="tooltip"
      data-open="false"
      data-side="top"
      className="tooltip-bubble max-w-[clamp(180px,70vw,280px)] rounded-lg bg-[#111] px-2.5 py-1.5 text-[11.5px] font-medium leading-snug text-white shadow-lg"
    >
      <span ref={textRef} className="block whitespace-pre-line break-words" />
      <span ref={arrowRef} className="tooltip-arrow bg-[#111]" />
    </div>
  );
}
