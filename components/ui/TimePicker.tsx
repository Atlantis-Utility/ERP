"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import FloatingLayer from "./FloatingLayer";

/**
 * A time field that looks like the rest of the app.
 *
 * `<input type="time">` hands the job to the browser, and the browser draws
 * its own thing: on Windows, Chrome opens three columns of blue-highlighted
 * numbers that match nothing else on the page, and Safari and Firefox each
 * do something different again. The date picker stopped using a native
 * control for that reason; this is the same argument for the other half of
 * a time.
 *
 * Values are 24-hour "HH:MM", which is what an <input type="time"> produced
 * and what every caller already stores. Only the display is 12-hour.
 */

export interface ParsedTime {
  hour: number; // 0-23
  minute: number;
}

export function parseTime(value: string | undefined | null): ParsedTime | null {
  const m = (value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "14:05" -> "2:05 PM". Empty for anything unparseable. */
export function formatTime12(value: string | undefined | null): string {
  const t = parseTime(value);
  if (!t) return "";
  const suffix = t.hour < 12 ? "AM" : "PM";
  const hour12 = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return `${hour12}:${pad(t.minute)} ${suffix}`;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 12, then 1..11 below
const ORDERED_HOURS = [12, ...HOURS.slice(0, 11)];

/**
 * The three columns. Split out so the date picker can show them inline
 * inside its own panel rather than opening a popover from a popover.
 */
export function TimeColumns({
  value,
  onChange,
  minuteStep = 5,
}: {
  value: string;
  onChange: (value: string) => void;
  minuteStep?: number;
}) {
  const parsed = parseTime(value);
  // An empty field shows nothing highlighted. Defaulting the columns to
  // 9:00 and drawing them as chosen would say the field holds a time it
  // doesn't, and the first click would look like it changed nothing.
  const hasValue = parsed !== null;
  const hour = parsed?.hour ?? 9;
  const minute = parsed?.minute ?? 0;
  const isPm = hour >= 12;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
  // A minute that isn't on the step (an existing 10:08) still has to be
  // selectable, or opening the picker would silently round it.
  const minuteOptions = minutes.includes(minute) ? minutes : [...minutes, minute].sort((a, b) => a - b);

  const emit = (h12: number, m: number, pm: boolean) => {
    const h24 = (h12 % 12) + (pm ? 12 : 0);
    onChange(`${pad(h24)}:${pad(m)}`);
  };

  const columnRef = useRef<HTMLDivElement>(null);
  // Scroll the chosen hour and minute into view when the panel appears,
  // otherwise a 9pm meeting opens showing midnight and looks unset.
  useEffect(() => {
    const root = columnRef.current;
    if (!root) return;
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-selected=true]"))) {
      el.scrollIntoView({ block: "center" });
    }
  }, []);

  const cell = (active: boolean) =>
    `w-full rounded-md py-1.5 text-[13px] font-medium transition-colors ${
      active ? "bg-[#0a0a0a] text-white" : "text-[#444] hover:bg-[#f5f5f5]"
    }`;

  return (
    <div ref={columnRef} className="flex gap-1.5">
      <div className="flex-1 max-h-44 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden space-y-0.5 pr-0.5">
        {ORDERED_HOURS.map((h) => (
          <button
            key={h}
            type="button"
            data-selected={hasValue && h === hour12}
            onClick={() => emit(h, minute, isPm)}
            className={cell(hasValue && h === hour12)}
          >
            {h}
          </button>
        ))}
      </div>
      <div className="flex-1 max-h-44 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden space-y-0.5 pr-0.5">
        {minuteOptions.map((m) => (
          <button
            key={m}
            type="button"
            data-selected={hasValue && m === minute}
            onClick={() => emit(hour12, m, isPm)}
            className={cell(hasValue && m === minute)}
          >
            {pad(m)}
          </button>
        ))}
      </div>
      <div className="w-14 space-y-0.5">
        {[false, true].map((pm) => (
          <button
            key={String(pm)}
            type="button"
            onClick={() => emit(hour12, minute, pm)}
            className={cell(hasValue && pm === isPm)}
          >
            {pm ? "PM" : "AM"}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TimePicker({
  value,
  onChange,
  placeholder = "Select time",
  disabled,
  className = "",
  minuteStep = 5,
  clearable = false,
}: {
  /** 24-hour "HH:MM", the same shape <input type="time"> used. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minuteStep?: number;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const display = formatTime12(value);

  const panel = (
    <div className="w-60 bg-white border border-[#eaeaea] rounded-xl shadow-xl shadow-black/8 p-3">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Time</span>
        <button
          type="button"
          onClick={() => {
            const now = new Date();
            const step = Math.max(1, minuteStep);
            const rounded = Math.round(now.getMinutes() / step) * step;
            const carry = rounded === 60;
            onChange(`${pad((now.getHours() + (carry ? 1 : 0)) % 24)}:${pad(carry ? 0 : rounded)}`);
          }}
          className="text-[11px] font-medium text-[#0070f3] px-1.5 py-0.5 rounded hover:bg-[#eff6ff] transition-colors"
        >
          Now
        </button>
      </div>

      <TimeColumns value={value} onChange={onChange} minuteStep={minuteStep} />

      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-[#f4f4f4]">
        {clearable && value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="text-[11px] font-medium text-[#999] hover:text-[#f31260] px-2 py-1.5 rounded-md hover:bg-[#fef2f2] transition-colors"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 text-xs font-semibold bg-[#0a0a0a] text-white py-2 rounded-lg hover:bg-[#333] transition-colors tracking-wide"
        >
          Done
        </button>
      </div>
    </div>
  );

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-3 h-9 text-sm rounded-lg border border-[#eaeaea] bg-white hover:border-[#ccc] transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[#0a0a0a]/10 disabled:opacity-60"
      >
        <Clock className="w-3.5 h-3.5 text-[#999] shrink-0" />
        <span className={display ? "text-[#0a0a0a] flex-1 truncate" : "text-[#bbb] flex-1 truncate"}>
          {display || placeholder}
        </span>
      </button>

      {open && (
        <FloatingLayer anchorRef={triggerRef} width={240} onClose={() => setOpen(false)}>
          {panel}
        </FloatingLayer>
      )}
    </div>
  );
}
