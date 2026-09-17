"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import {
  STATUS_LABELS,
  STATUS_STYLES,
  STATUS_ICONS,
  STATUS_ICON_COLORS,
  SETTABLE_STATUS_OPTIONS,
} from "@/lib/leads-constants";
import type { LeadStatus } from "@/lib/db/leads";

/**
 * Stage control: a coloured pill that opens a stage list.
 *
 * Custom rather than a native <select> for the same reason as
 * components/ui/Select.tsx, a native select's open list is OS-styled and
 * can't be restyled.
 *
 * The menu offers SETTABLE_STATUS_OPTIONS, which excludes "New": that's
 * where a lead starts, not somewhere you move it to. A lead sitting at New
 * still shows New on the pill, the current value is always rendered, even
 * when it isn't offered.
 */
export default function StatusPicker({
  value,
  onChange,
  className = "",
  disabled = false,
}: {
  value: LeadStatus;
  onChange: (value: LeadStatus) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const CurrentIcon = STATUS_ICONS[value];

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
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-xs font-medium rounded-full pl-2 pr-1.5 py-1 transition-colors disabled:opacity-60 ${STATUS_STYLES[value]}`}
      >
        {CurrentIcon && <CurrentIcon className="w-3 h-3 shrink-0" />}
        <span className="whitespace-nowrap">{STATUS_LABELS[value] ?? value}</span>
        {!disabled && <ChevronDown className={`w-3 h-3 opacity-50 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>

      {open && !disabled && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-[#eaeaea] rounded-lg shadow-lg p-1 z-50">
          {SETTABLE_STATUS_OPTIONS.map((s) => {
            const active = s.value === value;
            const Icon = STATUS_ICONS[s.value];
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  onChange(s.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-left transition-colors ${
                  active ? "bg-[#f5f5f5] font-medium text-[#0a0a0a]" : "text-[#444] hover:bg-[#fafafa]"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${STATUS_ICON_COLORS[s.value]}`} />
                <span className="flex-1 truncate">{s.label}</span>
                {active && <Check className="w-3.5 h-3.5 text-[#0a0a0a] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
