"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

const MIN_SCALE = 0.15;
const MAX_SCALE = 2.5;
const AUTO_FIT_FLOOR = 0.55; // never auto-shrink past this — below it, text/icons stop being readable

// Fits content to the frame's HEIGHT only (trees run wide, not tall, so
// width overflow is expected and handled by dragging to pan rather than
// shrinking everything down to an illegible size just to avoid a scrollbar).
// Wheel-to-zoom and drag-to-pan are still available for manual exploration.
export default function ZoomPan({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const fitToView = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const prevTransform = content.style.transform;
    content.style.transform = "none";
    const contentHeight = content.scrollHeight;
    content.style.transform = prevTransform;

    if (contentHeight === 0) return;
    const scaleY = container.clientHeight / contentHeight;
    const fitted = Math.min(scaleY, 1); // never zoom in past 100% on auto-fit
    setScale(Math.max(fitted, AUTO_FIT_FLOOR));
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    fitToView();
    const onResize = () => fitToView();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [children, fitToView]);

  // React's onWheel is attached as a passive listener, so e.preventDefault()
  // inside it silently no-ops — the page scrolls underneath at the same time
  // the div zooms. A native listener with { passive: false } is required to
  // actually stop that scroll from leaking past this component.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Scale the step by how far this particular event scrolled, instead of
      // a fixed jump per event — trackpads fire many small events (smooth),
      // notchy mice fire fewer large ones (still gentle either way), and a
      // per-event cap keeps any single big deltaY from causing a sudden leap.
      const step = Math.min(Math.abs(e.deltaY) * 0.0013, 0.08);
      const delta = e.deltaY > 0 ? -step : step;
      setScale((s) => Math.min(Math.max(s + delta, MIN_SCALE), MAX_SCALE));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function handleMouseDown(e: React.MouseEvent) {
    dragging.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    setIsDragging(true);
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    setPan({
      x: dragging.current.panX + (e.clientX - dragging.current.startX),
      y: dragging.current.panY + (e.clientY - dragging.current.startY),
    });
  }
  function stopDragging() {
    dragging.current = null;
    setIsDragging(false);
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-105 overflow-hidden cursor-grab active:cursor-grabbing select-none flex items-center justify-center"
      style={{ overscrollBehavior: "contain", touchAction: "none" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={stopDragging}
      onMouseLeave={stopDragging}
    >
      <div
        ref={contentRef}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transition: isDragging ? "none" : "transform 120ms ease-out",
        }}
      >
        {children}
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-0.5 bg-white border border-[#eaeaea] rounded-lg shadow-sm p-1">
        <button
          onClick={() => setScale((s) => Math.min(s + 0.15, MAX_SCALE))}
          className="p-1.5 hover:bg-[#f5f5f5] rounded text-[#666]"
          title="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setScale((s) => Math.max(s - 0.15, MIN_SCALE))}
          className="p-1.5 hover:bg-[#f5f5f5] rounded text-[#666]"
          title="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button onClick={fitToView} className="p-1.5 hover:bg-[#f5f5f5] rounded text-[#666]" title="Fit to view">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
