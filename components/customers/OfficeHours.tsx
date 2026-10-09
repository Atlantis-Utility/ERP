"use client";

import { useEffect, useState } from "react";
import { Clock, ExternalLink } from "lucide-react";
import {
  openState,
  weekSummary,
  hasHours,
  googleMapsSearch,
  type CustomerHours,
} from "@/lib/customer-hours";

/**
 * Whether this customer is open right now.
 *
 * One line answers the question somebody actually has - "can I ring them?" -
 * and the week sits underneath it for the times that line doesn't cover.
 * Blank is a real state: nobody has filled these in yet, which is not the
 * same as being shut, and the empty case says so and offers the search that
 * would answer it.
 */
export default function OfficeHours({
  hours,
  companyName,
  address,
  onEdit,
}: {
  hours: CustomerHours;
  companyName: string;
  address: string;
  /** Opens the details drawer, where the hours are typed in. */
  onEdit?: () => void;
}) {
  // Re-read on the minute: a card left open through five o'clock should stop
  // claiming they're open. Held in state because the clock is impure and
  // doesn't belong in a render.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const filled = hasHours(hours);
  const state = openState(hours, now);
  const week = weekSummary(hours);
  const today = now.getDay();

  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-1">Office Hours</p>

      {!filled ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-[#0a0a0a]">-</p>
          <a
            href={googleMapsSearch(companyName, address)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] font-medium text-[#0070f3] hover:underline"
          >
            Look them up <ExternalLink className="w-3 h-3" />
          </a>
          {onEdit && (
            <button onClick={onEdit} className="text-[11px] font-medium text-[#999] hover:text-[#0a0a0a] transition-colors">
              and add them
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2 py-0.5 ${
                state.open ? "bg-[#f0fdf4] text-[#17c964]" : "bg-[#f5f5f5] text-[#666]"
              }`}
            >
              <Clock className="w-3 h-3" />
              {state.label}
            </span>
            {state.detail && <span className="text-sm font-medium text-[#0a0a0a]">{state.detail}</span>}
          </div>

          {/* The week, folded so Monday to Friday is one line rather than five. */}
          <div className="mt-2 space-y-0.5">
            {week.map((line) => {
              const isToday = line.indexes.includes(today);
              return (
                <div key={line.days} className="flex items-baseline gap-2 text-[11px]">
                  <span className={`w-20 shrink-0 ${isToday ? "text-[#0a0a0a] font-medium" : "text-[#999]"}`}>
                    {line.days}
                  </span>
                  <span className={isToday ? "text-[#0a0a0a] font-medium" : "text-[#666]"}>{line.hours}</span>
                </div>
              );
            })}
          </div>

          {hours.note.trim() && <p className="text-[11px] text-[#999] mt-1.5">{hours.note}</p>}
        </>
      )}
    </div>
  );
}
