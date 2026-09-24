"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Calendar, Clock } from "lucide-react";
import FloatingLayer from "./FloatingLayer";
import { TimeColumns, formatTime12 } from "./TimePicker";

interface Props {
  value: string; // "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD" (when dateOnly)
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  dateOnly?: boolean;
  disabled?: boolean;
  /**
   * "cell" strips the border so the trigger can sit in a spreadsheet cell and
   * read as part of the grid rather than as a form control.
   */
  variant?: "control" | "cell";
  /**
   * Renders the calendar in a portal, positioned against the trigger. On by
   * default, for the same reason as Select: a calendar is taller than most of
   * the containers it opens in, and a scrolling ancestor clips it. Pass
   * `floating={false}` to keep it in flow.
   */
  floating?: boolean;
  /**
   * Adds a Clear action. Opt-in: a required date shouldn't offer to empty
   * itself, so the existing callers keep their current behaviour.
   */
  clearable?: boolean;
  /**
   * Today / Tomorrow / Next week shortcuts. For a follow-up date those are
   * almost always the answer, and clicking three times through a month grid
   * to reach tomorrow is the kind of small friction that stops people
   * setting one at all.
   */
  quickDates?: boolean;
}

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseValue(val: string, dateOnly = false) {
  if (!val) return null;
  if (dateOnly) {
    const [y, m, d] = val.split("-").map(Number);
    if (!y || !m || !d) return null;
    return { year: y, month: m - 1, day: d, hour: 9, minute: 0 };
  }
  const [datePart, timePart] = val.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min] = (timePart ?? "09:00").split(":").map(Number);
  return { year: y, month: m - 1, day: d, hour: h, minute: min };
}

function toLocalDateTimeString(year: number, month: number, day: number, time: string): string {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}T${time}`;
}

function formatDisplay(val: string, dateOnly = false): string {
  const p = parseValue(val, dateOnly);
  if (!p) return "";
  const d = new Date(p.year, p.month, p.day, p.hour, p.minute);
  if (dateOnly) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

export default function DateTimePicker({
  value,
  onChange,
  placeholder,
  className = "",
  dateOnly = false,
  disabled = false,
  variant = "control",
  floating = true,
  clearable = false,
  quickDates = false,
}: Props) {
  const isCell = variant === "cell";
  const today = new Date();
  const parsed = parseValue(value, dateOnly);
  const defaultPlaceholder = dateOnly ? "Select date" : "Select date & time";

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());
  const [selectedDate, setSelectedDate] = useState<{ year: number; month: number; day: number } | null>(
    parsed ? { year: parsed.year, month: parsed.month, day: parsed.day } : null
  );
  const [timeOpen, setTimeOpen] = useState(false);
  const [time, setTime] = useState(
    parsed
      ? `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`
      : "09:00"
  );

  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // When floating, the calendar is rendered in a portal outside this
    // subtree, so FloatingLayer handles dismissal: testing "outside ref"
    // here would treat a click on a day as a click outside and close the
    // calendar before the day registered.
    if (floating) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [floating]);

  // Sync state when value changes externally
  useEffect(() => {
    const p = parseValue(value, dateOnly);
    if (p) {
      setSelectedDate({ year: p.year, month: p.month, day: p.day });
      setViewYear(p.year);
      setViewMonth(p.month);
      setTime(`${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`);
    } else {
      setSelectedDate(null);
    }
  }, [value, dateOnly]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  /** Jumps the view and the selection to a specific date (the shortcuts). */
  function applyDate(d: Date) {
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDate({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate() });
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    if (dateOnly) {
      onChange(`${d.getFullYear()}-${mm}-${dd}`);
      setOpen(false);
    } else {
      onChange(toLocalDateTimeString(d.getFullYear(), d.getMonth(), d.getDate(), time));
    }
  }

  const shortcuts: { label: string; days: number }[] = [
    { label: "Today", days: 0 },
    { label: "Tomorrow", days: 1 },
    { label: "Next week", days: 7 },
  ];

  function selectDay(day: number) {
    const sd = { year: viewYear, month: viewMonth, day };
    setSelectedDate(sd);
    if (dateOnly) {
      const mm = String(viewMonth + 1).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      onChange(`${viewYear}-${mm}-${dd}`);
      setOpen(false);
    } else {
      onChange(toLocalDateTimeString(viewYear, viewMonth, day, time));
    }
  }

  function handleTimeChange(t: string) {
    setTime(t);
    if (selectedDate) {
      onChange(toLocalDateTimeString(selectedDate.year, selectedDate.month, selectedDate.day, t));
    }
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (day: number) =>
    day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  const isSelected = (day: number) =>
    selectedDate?.day === day &&
    selectedDate?.month === viewMonth &&
    selectedDate?.year === viewYear;

  const isPast = (day: number) =>
    new Date(viewYear, viewMonth, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const calendar = (
    <div
      className={`w-68 bg-white border border-[#eaeaea] rounded-xl shadow-xl shadow-black/8 p-4 ${
        floating ? "" : "absolute z-50 top-[calc(100%+6px)] left-0"
      }`}
    >
      {quickDates && (
        <div className="flex items-center gap-1.5 mb-3 pb-3 border-b border-[#f4f4f4]">
          {shortcuts.map((s) => {
            const d = new Date();
            d.setDate(d.getDate() + s.days);
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => applyDate(d)}
                className="flex-1 text-[11px] font-medium text-[#444] bg-[#f5f5f5] rounded-md py-1.5 hover:bg-[#eaeaea] transition-colors"
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={prevMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f5f5f5] transition-colors text-[#666]"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-[#0a0a0a] tracking-tight">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </p>
        <button
          type="button"
          onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f5f5f5] transition-colors text-[#666]"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d) => (
          <p key={d} className="text-center text-[10px] font-semibold text-[#bbb] py-0.5 uppercase tracking-wider">
            {d}
          </p>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => (
          <div key={i} className="flex items-center justify-center py-0.5">
            {day ? (
              <button
                type="button"
                onClick={() => selectDay(day)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                  isSelected(day)
                    ? "bg-[#0a0a0a] text-white"
                    : isToday(day)
                      ? "ring-1 ring-[#0a0a0a] text-[#0a0a0a] hover:bg-[#f0f0f0]"
                      : isPast(day)
                        ? "text-[#ccc] hover:bg-[#f5f5f5] cursor-default"
                        : "text-[#333] hover:bg-[#f5f5f5]"
                }`}
              >
                {day}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {clearable && value && (
        <div className="mt-2 pt-2 border-t border-[#f4f4f4]">
          <button
            type="button"
            onClick={() => {
              setSelectedDate(null);
              onChange("");
              setOpen(false);
            }}
            className="w-full text-[11px] font-medium text-[#999] hover:text-[#f31260] py-1.5 rounded-md hover:bg-[#fef2f2] transition-colors"
          >
            Clear date
          </button>
        </div>
      )}

      {/* Time section, hidden in dateOnly mode */}
      {!dateOnly && (
        <>
          <div className="mt-3 pt-3 border-t border-[#f4f4f4]">
            {/* The time reads as a value until you go to change it. The
                columns are the same ones TimePicker uses, shown in place
                rather than as a popover out of a popover. */}
            <button
              type="button"
              onClick={() => setTimeOpen((o) => !o)}
              className="w-full flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-[#fafafa] transition-colors"
            >
              <div className="flex items-center gap-1.5 flex-1">
                <Clock className="w-3.5 h-3.5 text-[#999] shrink-0" />
                <span className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Time</span>
              </div>
              <span className="text-sm font-medium text-[#0a0a0a] bg-[#f5f5f5] rounded-lg px-2.5 py-1">
                {formatTime12(time) || "Set"}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[#999] transition-transform ${timeOpen ? "rotate-180" : ""}`}
              />
            </button>

            {timeOpen && (
              <div className="mt-2">
                <TimeColumns value={time} onChange={handleTimeChange} />
              </div>
            )}
          </div>

          {/* Confirm: only needed when time is selectable */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 w-full text-xs font-semibold bg-[#0a0a0a] text-white py-2 rounded-lg hover:bg-[#333] transition-colors tracking-wide"
          >
            Confirm
          </button>
        </>
      )}
    </div>
  );

  return (
    <div ref={ref} className={isCell ? `relative h-full ${className}` : `relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={
          isCell
            ? `w-full h-full flex items-center gap-1 px-1 text-[12px] text-left bg-transparent transition-colors focus:outline-none disabled:opacity-60 ${
                open ? "bg-[#eff6ff]" : "hover:bg-[#f5f5f5]"
              }`
            : "w-full flex items-center gap-2.5 px-3 h-9 text-sm rounded-lg border border-[#eaeaea] bg-white hover:border-[#ccc] transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[#0a0a0a]/10 disabled:opacity-60"
        }
      >
        <Calendar className={`${isCell ? "w-3 h-3" : "w-3.5 h-3.5"} text-[#999] shrink-0`} />
        <span className={value ? "text-[#0a0a0a] flex-1 truncate" : "text-[#bbb] flex-1 truncate"}>
          {value ? formatDisplay(value, dateOnly) : (placeholder ?? defaultPlaceholder)}
        </span>
      </button>

      {open &&
        (floating ? (
          <FloatingLayer anchorRef={triggerRef} width={272} onClose={() => setOpen(false)}>
            {calendar}
          </FloatingLayer>
        ) : (
          calendar
        ))}
    </div>
  );
}
