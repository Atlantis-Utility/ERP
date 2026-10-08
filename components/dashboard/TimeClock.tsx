"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Loader2, Play, Square, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useEmployees } from "@/lib/db/employees";
import { hasPageAccess } from "@/lib/nav-pages";
import { getErrorMessage } from "@/lib/utils";
import { useToast } from "@/lib/toast";
import {
  useShifts,
  clockIn,
  clockOut,
  openShift,
  shiftSeconds,
  totalSeconds,
  formatDuration,
  startOfToday,
  startOfWeek,
  type Shift,
} from "@/lib/db/time-clock";

/**
 * Clocking in and out, for the person looking at it.
 *
 * The panel is the whole interaction: one button, what today adds up to,
 * and what the week adds up to. An administrator also sees who else is on
 * the clock right now, because "is anybody working?" is the question this
 * answers for them, and the full log is a page of its own.
 *
 * The running total ticks every second rather than on a refresh: a clock
 * that doesn't move is one people check twice to see whether it's broken.
 */
function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function TimeClock() {
  const { authUser } = useAuth();
  const employees = useEmployees();
  const { success, error: toastError } = useToast();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const me = authUser?.accessEmployeeId ?? null;
  const isAdmin = authUser?.isAdmin ?? false;
  // An administrator watches the team; everybody else sees their own week.
  const { shifts, loading, error } = useShifts({ from: startOfWeek() });

  const mine = shifts.filter((s) => s.employeeId === me);
  const current = openShift(shifts, me);
  const today = startOfToday().getTime();
  const todayShifts = mine.filter((s) => Date.parse(s.clockedIn) >= today);
  const onTheClock = shifts.filter((s) => !s.clockedOut && s.employeeId !== me);
  const nameFor = (id: string) => employees.find((e) => e.id === id)?.name ?? id;

  useEffect(() => {
    if (!current && onTheClock.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [current, onTheClock.length]);

  async function toggle() {
    if (!me) return;
    setBusy(true);
    try {
      if (current) {
        const worked = formatDuration(shiftSeconds(current, now));
        await clockOut(current.id, { id: me, name: authUser?.displayName ?? "" });
        success(`Clocked out after ${worked}.`);
      } else {
        await clockIn(me);
        success("Clocked in.");
      }
    } catch (err) {
      toastError(getErrorMessage(err, "Couldn't update the clock"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#f4f4f4] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-[#fafafa] border border-[#f0f0f0]">
            <Clock className="w-3.5 h-3.5 text-[#666]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0a0a0a] leading-none">Time Clock</p>
            <p className="text-[11px] text-[#999] mt-1">
              {current ? `On the clock since ${timeOfDay(current.clockedIn)}` : "Not clocked in"}
            </p>
          </div>
        </div>
        {hasPageAccess("/time-clock", authUser?.access) && (
          <Link
            href="/time-clock"
            className="flex items-center gap-1 text-[11px] font-medium text-[#0070f3] hover:underline"
          >
            Timesheet <ArrowUpRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {error ? (
          <p className="px-5 py-6 text-sm text-[#f31260]">{error}</p>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#999]">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="px-5 py-4">
              {/* The running total is the headline: it's what somebody opens
                  this panel to read. */}
              <p className="text-3xl font-bold tabular-nums leading-none text-[#0a0a0a]">
                {formatDuration(totalSeconds(todayShifts, now))}
              </p>
              <p className="text-[11px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">
                Today · {formatDuration(totalSeconds(mine, now))} this week
              </p>

              <button
                onClick={toggle}
                disabled={busy || !me}
                title={me ? undefined : "Your sign-in isn't linked to an employee record"}
                className={`mt-4 w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-40 ${
                  current
                    ? "bg-[#fef2f2] text-[#f31260] hover:bg-[#fde8e8]"
                    : "bg-[#0a0a0a] text-white hover:bg-[#333]"
                }`}
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : current ? (
                  <Square className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                {current ? "Clock out" : "Clock in"}
              </button>
            </div>

            {todayShifts.length > 0 && (
              <div className="px-5 pb-3">
                <p className="text-[10px] font-semibold text-[#bbb] uppercase tracking-wider mb-1.5">Today</p>
                {todayShifts.map((s: Shift) => (
                  <div key={s.id} className="flex items-center justify-between py-1 text-[12px]">
                    <span className="text-[#666]">
                      {timeOfDay(s.clockedIn)} – {s.clockedOut ? timeOfDay(s.clockedOut) : "now"}
                    </span>
                    <span className="text-[#0a0a0a] tabular-nums">{formatDuration(shiftSeconds(s, now))}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Who else is working, for whoever is allowed to see it. */}
            {isAdmin && (
              <div className="px-5 pb-4 border-t border-[#f4f4f4] pt-3">
                <p className="text-[10px] font-semibold text-[#bbb] uppercase tracking-wider mb-1.5">
                  On the clock {onTheClock.length > 0 && `· ${onTheClock.length}`}
                </p>
                {onTheClock.length === 0 ? (
                  <p className="text-[12px] text-[#bbb]">Nobody else is clocked in.</p>
                ) : (
                  onTheClock.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-1 text-[12px]">
                      <span className="text-[#666] truncate">{nameFor(s.employeeId)}</span>
                      <span className="text-[#17c964] tabular-nums shrink-0">
                        {formatDuration(shiftSeconds(s, now))}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
