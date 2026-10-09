"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import ExportMenu from "@/components/ui/ExportMenu";
import Select from "@/components/ui/Select";
import { Clock, Loader2, Square, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useEmployees } from "@/lib/db/employees";
import { useConfirm } from "@/lib/confirm";
import { useToast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/utils";
import {
  useShifts,
  clockOut,
  removeShift,
  shiftSeconds,
  totalSeconds,
  formatDuration,
  type Shift,
} from "@/lib/db/time-clock";

export const dynamic = "force-dynamic";

/**
 * Who worked when.
 *
 * An administrator sees the team; everybody else sees themselves, because
 * that is what the row policy returns and the page has no business
 * pretending otherwise. The totals are the point of the page, so they sit
 * at the top, per person, with the shifts underneath.
 *
 * Requires supabase/migration-time-clock.sql.
 */
const RANGES = [
  { value: "week", label: "This week" },
  { value: "today", label: "Today" },
  { value: "month", label: "This month" },
  { value: "last30", label: "Last 30 days" },
  { value: "all", label: "Everything" },
];

function rangeStart(range: string): Date | undefined {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "today") return d;
  if (range === "week") {
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  if (range === "month") {
    d.setDate(1);
    return d;
  }
  if (range === "last30") {
    d.setDate(d.getDate() - 30);
    return d;
  }
  return undefined;
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function TimeClockPage() {
  const { authUser } = useAuth();
  const employees = useEmployees();
  const confirm = useConfirm();
  const { success, error: toastError } = useToast();
  const [range, setRange] = useState("week");
  const [who, setWho] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const isAdmin = authUser?.isAdmin ?? false;
  const { shifts, loading, error, reload } = useShifts({ from: rangeStart(range), employeeId: who || undefined });
  const nameFor = (id: string) => employees.find((e) => e.id === id)?.name ?? id;

  // Live, because an open shift is still counting while this is on screen.
  // Held in state rather than read during render: the clock is the one
  // impure thing on the page, and it belongs in an effect.
  const [now, setNow] = useState(() => Date.now());
  const anyOpen = shifts.some((s) => !s.clockedOut);
  useEffect(() => {
    if (!anyOpen) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [anyOpen]);

  const byPerson = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shifts) map.set(s.employeeId, [...(map.get(s.employeeId) ?? []), s]);
    return [...map.entries()]
      .map(([id, list]) => ({
        id,
        name: nameFor(id),
        shifts: list,
        seconds: totalSeconds(list, now),
        open: list.some((s) => !s.clockedOut),
      }))
      .sort((a, b) => b.seconds - a.seconds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, employees, now]);

  const exportData = () => ({
    filename: `time-clock-${range}`,
    title: "Time Clock",
    headers: ["Employee", "Date", "Clocked In", "Clocked Out", "Hours", "Note"],
    rows: shifts.map((s) => [
      nameFor(s.employeeId),
      new Date(s.clockedIn).toLocaleDateString("en-US"),
      time(s.clockedIn),
      s.clockedOut ? time(s.clockedOut) : "still on the clock",
      formatDuration(shiftSeconds(s, now)),
      s.note ?? "",
    ]),
  });

  async function closeShift(shift: Shift) {
    const ok = await confirm({
      title: `Clock ${nameFor(shift.employeeId)} out?`,
      description: `This shift started at ${time(shift.clockedIn)} on ${day(shift.clockedIn)} and is still running. It will be closed at the current time.`,
      confirmLabel: "Clock out",
    });
    if (!ok) return;
    setBusyId(shift.id);
    try {
      await clockOut(shift.id, authUser ? { id: authUser.accessEmployeeId ?? "", name: authUser.displayName } : null);
      success("Shift closed.");
      reload();
    } catch (err) {
      toastError(getErrorMessage(err, "Couldn't close that shift"));
    } finally {
      setBusyId(null);
    }
  }

  async function drop(shift: Shift) {
    const ok = await confirm({
      title: "Remove this shift?",
      description: `${nameFor(shift.employeeId)}, ${day(shift.clockedIn)} at ${time(shift.clockedIn)}. It stops counting towards their hours.`,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    setBusyId(shift.id);
    try {
      await removeShift(shift.id);
      success("Shift removed.");
      reload();
    } catch (err) {
      toastError(getErrorMessage(err, "Couldn't remove that shift"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <Header
        title="Time Clock"
        subtitle={
          isAdmin
            ? `${byPerson.length} ${byPerson.length === 1 ? "person" : "people"} · ${formatDuration(totalSeconds(shifts, now))} in this period`
            : `Your hours · ${formatDuration(totalSeconds(shifts, now))} in this period`
        }
        actions={<ExportMenu data={exportData} disabled={shifts.length === 0} />}
      />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="w-44">
          <Select value={range} onChange={setRange} options={RANGES} />
        </div>
        {isAdmin && (
          <div className="w-56">
            <Select
              value={who}
              onChange={setWho}
              placeholder="Everyone"
              options={employees.map((e) => ({ value: e.id, label: e.name }))}
              searchable
              clearable
            />
          </div>
        )}
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#999]" />}
      </div>

      {error ? (
        <div className="bg-white border border-[#eaeaea] rounded-xl p-10 text-center">
          <p className="text-sm text-[#f31260]">{error}</p>
          <p className="text-xs text-[#999] mt-1">
            If this is new, supabase/migration-time-clock.sql may not have been run yet.
          </p>
        </div>
      ) : shifts.length === 0 && !loading ? (
        <div className="bg-white border border-[#eaeaea] rounded-xl p-12 text-center">
          <Clock className="w-8 h-8 text-[#ddd] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#999]">Nothing on the clock in this period</p>
          <p className="text-xs text-[#bbb] mt-1">
            Hours appear here as people clock in from their dashboard.
          </p>
        </div>
      ) : (
        <>
          {/* Totals first: the question is almost always "how many hours". */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#f4f4f4] border border-[#eaeaea] rounded-xl mb-5 overflow-hidden">
            {byPerson.slice(0, 8).map((p) => (
              <div key={p.id} className="bg-white px-4 py-4">
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold tabular-nums leading-none text-[#0a0a0a]">
                    {formatDuration(p.seconds)}
                  </p>
                  {p.open && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#17c964] bg-[#f0fdf4] rounded-full px-1.5 py-0.5">
                      on the clock
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#999] mt-1.5 font-medium uppercase tracking-wide truncate">
                  {p.name} · {p.shifts.length} shift{p.shifts.length === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-[#eaeaea] rounded-xl overflow-x-auto">
            <table className="w-full min-w-160">
              <thead>
                <tr className="border-b border-[#eaeaea] bg-[#fafafa]">
                  {["Employee", "Date", "In", "Out", "Hours", "Note", ""].map((h, i) => (
                    <th
                      key={h || i}
                      className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={s.id} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-[#0a0a0a] whitespace-nowrap">
                      {nameFor(s.employeeId)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666] whitespace-nowrap">{day(s.clockedIn)}</td>
                    <td className="px-4 py-3 text-sm text-[#666] whitespace-nowrap tabular-nums">{time(s.clockedIn)}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap tabular-nums">
                      {s.clockedOut ? (
                        <span className="text-[#666]">{time(s.clockedOut)}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#17c964] bg-[#f0fdf4] rounded-full px-2 py-0.5">
                          still on
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#0a0a0a] tabular-nums whitespace-nowrap">
                      {formatDuration(shiftSeconds(s, now))}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666]">{s.note ?? "-"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {/* Corrections are an administrator's: a forgotten
                          clock-out, or a shift that shouldn't be there. */}
                      {isAdmin && (
                        <div className="flex items-center justify-end gap-1">
                          {!s.clockedOut && (
                            <button
                              onClick={() => closeShift(s)}
                              disabled={busyId === s.id}
                              title="Clock them out now"
                              className="p-1.5 rounded-md text-[#999] hover:text-[#0a0a0a] hover:bg-[#f5f5f5] transition-colors disabled:opacity-40"
                            >
                              {busyId === s.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Square className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => drop(s)}
                            disabled={busyId === s.id}
                            title="Remove this shift"
                            className="p-1.5 rounded-md text-[#bbb] hover:text-[#f31260] hover:bg-[#fff0f3] transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
