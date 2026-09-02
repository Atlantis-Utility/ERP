"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { STATUS_OPTIONS, STATUS_STYLES, STATUS_DOT_COLORS } from "@/lib/leads-constants";
import type { LeadStatus } from "@/lib/db/leads";

// Custom status dropdown replacing a raw <select>, same reasoning as
// components/ui/Select.tsx: a native select renders the OS's own arrow/menu
// chrome, which can't be restyled and looks out of place next to the rest
// of the app's Lucide-icon controls. Rendered as a colored pill (matching
// the status everywhere else in the app) with a proper dropdown menu.
export default function StatusPicker({ value, onChange, className = "" }: { value: LeadStatus; onChange: (value: LeadStatus) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = STATUS_OPTIONS.find((s) => s.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 text-xs font-medium rounded-full pl-2.5 pr-1.5 py-1 transition-colors ${STATUS_STYLES[value]}`}
      >
        {current?.label ?? value}
        <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-40 bg-white border border-[#eaeaea] rounded-lg shadow-lg py-1 z-50">
          {STATUS_OPTIONS.map((s) => {
            const active = s.value === value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => { onChange(s.value); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                  active ? "bg-[#f5f5f5] font-medium text-[#0a0a0a]" : "text-[#444] hover:bg-[#fafafa]"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT_COLORS[s.value]}`} />
                <span className="flex-1">{s.label}</span>
                {active && <Check className="w-3.5 h-3.5 text-[#0070f3] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
