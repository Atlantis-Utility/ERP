"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/layout/Header";
import TaskDetailDrawer from "@/components/tasks/TaskDetailDrawer";
import OutlookEventDetailDrawer, { type OutlookEvent, resolveEventCompany } from "@/components/tasks/OutlookEventDetailDrawer";
import { subscribeTasks, updateTask, removeTask } from "@/lib/db/tasks";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";
import { ChevronLeft, ChevronRight, Users, Building2, Pencil } from "lucide-react";

const NO_COMPANY_LABEL = "Atlantis Utility";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Extract YYYY-MM-DD from an Outlook event start string (same rule the Tasks
// page's calendar view uses, so both stay consistent).
function outlookDateStr(start: string): string {
  return start.length === 10 ? start : start.slice(0, 10);
}

// Full "10:00 AM – 10:30 AM" time range for the Today panel, where there's
// room to show it properly (unlike the month-grid cells, which stay time-free
// to keep every day's row list compact and scannable).
function formatMeetingTimeRange(time?: string, duration?: number): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const start = new Date();
  start.setHours(h, m, 0, 0);
  const startLabel = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (!duration) return startLabel;
  const end = new Date(start.getTime() + duration * 60_000);
  const endLabel = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${startLabel} – ${endLabel}`;
}

function formatOutlookTimeRange(start: string, end: string, isAllDay: boolean): string {
  if (isAllDay) return "All day";
  const s = new Date(start);
  if (isNaN(s.getTime())) return "";
  const sLabel = s.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const e = new Date(end);
  if (isNaN(e.getTime())) return sLabel;
  const eLabel = e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${sLabel} – ${eLabel}`;
}

export default function CalendarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [outlookBanner, setOutlookBanner] = useState<"connected" | "error" | null>(null);
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => ymd(new Date()));

  const [outlookConnected, setOutlookConnected] = useState(false);
  const [outlookEvents, setOutlookEvents] = useState<OutlookEvent[]>([]);
  const [selectedOutlookEvent, setSelectedOutlookEvent] = useState<OutlookEvent | null>(null);
  const [outlookDetailOpen, setOutlookDetailOpen] = useState(false);

  // Meetings live in the same "tasks" table as everything else on the Tasks
  // board and the dashboard's Today's Schedule tab — this subscription shares
  // the same realtime channel, so a meeting created/edited/deleted here shows
  // up there immediately, and vice versa.
  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:tasks");
      if (c) setCards(JSON.parse(c));
    } catch {}
    const unsub = subscribeTasks((cs) => {
      setCards(cs);
      try { localStorage.setItem("sc:tasks", JSON.stringify(cs)); } catch {}
    });
    return unsub;
  }, []);

  // Microsoft/Outlook connects automatically on sign-in (see lib/auth-context.tsx),
  // so this page just checks the same cookie the Tasks page checks — no manual
  // "Connect" step needed here.
  useEffect(() => {
    setOutlookConnected(document.cookie.includes("outlook_connected=1"));

    const param = searchParams.get("outlook");
    if (param === "connected") {
      setOutlookConnected(true);
      setOutlookBanner("connected");
      router.replace("/calendar");
      setTimeout(() => setOutlookBanner(null), 4000);
    } else if (param === "error") {
      setOutlookBanner("error");
      router.replace("/calendar");
      setTimeout(() => setOutlookBanner(null), 4000);
    }
  }, [searchParams, router]);

  const fetchOutlookEvents = useCallback(async (year: number, month: number) => {
    try {
      const timeMin = new Date(year, month, 1).toISOString();
      const timeMax = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      const res = await fetch(`/api/outlook-calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`);
      if (res.status === 401) {
        setOutlookConnected(false);
        setOutlookEvents([]);
        return;
      }
      const data = await res.json();
      const events: OutlookEvent[] = data.events ?? [];
      setOutlookEvents(events);
      try { localStorage.setItem(`sc:outlook:${year}-${month}`, JSON.stringify(events)); } catch {}
    } catch {
      // silently fail — internal meetings still show
    }
  }, []);

  // Stale-while-revalidate: paint instantly from whatever this month showed
  // last time (localStorage), then refresh from Microsoft in the background —
  // the alternative is a blank grid every visit while the token-refresh +
  // Graph round trip completes.
  useEffect(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    try {
      const cached = localStorage.getItem(`sc:outlook:${year}-${month}`);
      if (cached) setOutlookEvents(JSON.parse(cached));
      else setOutlookEvents([]);
    } catch {
      setOutlookEvents([]);
    }
    if (outlookConnected) fetchOutlookEvents(year, month);
  }, [outlookConnected, cursor, fetchOutlookEvents]);

  const meetingsByDate = useMemo(() => {
    const map = new Map<string, KanbanCard[]>();
    for (const c of cards) {
      if (c.type !== "meeting" || !c.meetingDate) continue;
      if (!map.has(c.meetingDate)) map.set(c.meetingDate, []);
      map.get(c.meetingDate)!.push(c);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.meetingTime || "").localeCompare(b.meetingTime || ""));
    }
    return map;
  }, [cards]);

  const outlookByDate = useMemo(() => {
    const map = new Map<string, OutlookEvent[]>();
    for (const e of outlookEvents) {
      const key = outlookDateStr(e.start);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start.localeCompare(b.start));
    }
    return map;
  }, [outlookEvents]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const todayKey = ymd(new Date());
  const selectedMeetings = meetingsByDate.get(selectedDate) ?? [];
  const selectedOutlook = outlookByDate.get(selectedDate) ?? [];
  const selectedDateLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  function goPrevMonth() { setCursor(new Date(year, month - 1, 1)); }
  function goNextMonth() { setCursor(new Date(year, month + 1, 1)); }
  function goToday() {
    const d = new Date();
    setSelectedDate(ymd(d));
    d.setDate(1);
    setCursor(d);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center h-10 -mt-3 md:-mt-4">
        <Header title="Calendar" className="mb-0" />
      </div>

      {outlookBanner === "connected" && (
        <div className="shrink-0 mt-4 flex items-center gap-2 bg-[#f0fdf4] border border-[#bbf7d0] text-[#16a34a] text-xs font-medium px-4 py-2.5 rounded-xl">
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="7.5" height="7.5" fill="#F25022"/><rect x="9.5" y="1" width="7.5" height="7.5" fill="#7FBA00"/><rect x="1" y="9.5" width="7.5" height="7.5" fill="#00A4EF"/><rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900"/></svg>
          Outlook Calendar connected. Your events are now synced.
        </div>
      )}
      {outlookBanner === "error" && (
        <div className="shrink-0 mt-4 flex items-center gap-2 bg-[#fff0f3] border border-[#fecdd3] text-[#f31260] text-xs font-medium px-4 py-2.5 rounded-xl">
          Outlook Calendar connection failed. Please try again.
        </div>
      )}

      <div className="flex-1 min-h-0 flex gap-4 mt-4">
      <div className="flex-1 min-h-0 flex flex-col bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f4f4f4] shrink-0">
          <p className="text-sm font-semibold text-[#0a0a0a]">{monthLabel}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={goToday}
              className="text-xs font-medium text-[#666] hover:text-[#0a0a0a] px-2.5 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
            >
              Today
            </button>
            <button
              onClick={goPrevMonth}
              className="p-1.5 rounded-lg border border-[#eaeaea] text-[#666] hover:text-[#0a0a0a] hover:border-[#ccc] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goNextMonth}
              className="p-1.5 rounded-lg border border-[#eaeaea] text-[#666] hover:text-[#0a0a0a] hover:border-[#ccc] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-[#f4f4f4] shrink-0">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2 text-center text-[10px] font-semibold text-[#999] uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-7 grid-rows-6">
          {cells.map((d, i) => {
            const key = ymd(d);
            const inMonth = d.getMonth() === month;
            const isToday = key === todayKey;
            const isSelected = key === selectedDate;
            const dayMeetings = meetingsByDate.get(key) ?? [];
            const dayOutlook = outlookByDate.get(key) ?? [];
            const allItems = [
              ...dayMeetings.map((m) => ({ kind: "meeting" as const, card: m })),
              ...dayOutlook.map((e) => ({ kind: "outlook" as const, event: e })),
            ];
            const visible = allItems.slice(0, 2);
            const overflow = allItems.length - visible.length;
            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedDate(key)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedDate(key); }}
                className={`min-h-0 overflow-hidden flex flex-col cursor-pointer border-b border-r border-[#f4f4f4] px-1.5 py-1 transition-colors ${(i + 1) % 7 === 0 ? "border-r-0" : ""} ${i >= 35 ? "border-b-0" : ""} ${!inMonth ? "bg-[#fafafa]" : isSelected ? "bg-[#f0f7ff]" : "hover:bg-[#fafafa]"}`}
              >
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-medium leading-none shrink-0 ${
                    isToday ? "bg-[#0a0a0a] text-white" : isSelected ? "ring-2 ring-[#0070f3] text-[#0070f3]" : inMonth ? "text-[#0a0a0a]" : "text-[#bbb]"
                  }`}
                >
                  {d.getDate()}
                </span>
                <div className="mt-0.5 space-y-0.5 min-h-0 overflow-hidden">
                  {visible.map((item) =>
                    item.kind === "meeting" ? (
                      <button
                        key={item.card.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedCard(item.card); setDetailOpen(true); }}
                        className="w-full flex items-center px-1.5 py-1 rounded bg-[#e8f2ff] hover:bg-[#d8eaff] transition-colors text-left leading-none"
                      >
                        <span className="text-[10px] font-medium text-[#0a0a0a] truncate">{item.card.title}</span>
                      </button>
                    ) : (
                      <button
                        key={item.event.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedOutlookEvent(item.event); setOutlookDetailOpen(true); }}
                        className="w-full flex items-center px-1.5 py-1 rounded bg-[#eef2ff] hover:bg-[#e0e7ff] transition-colors text-left leading-none"
                      >
                        <span className="text-[10px] font-medium text-[#4338ca] truncate">{item.event.title}</span>
                      </button>
                    )
                  )}
                  {overflow > 0 && (
                    <p className="text-[9px] text-[#999] px-1 leading-none">+{overflow} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-80 shrink-0 flex flex-col bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#f4f4f4] shrink-0">
          <p className="text-sm font-semibold text-[#0a0a0a]">{selectedDateLabel}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {selectedMeetings.length === 0 && selectedOutlook.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-[#999] text-center px-4">
              No meetings scheduled this day
            </div>
          ) : (
            <>
              {selectedMeetings.map((m) => {
                const company = m.company?.trim() || NO_COMPANY_LABEL;
                const openDetail = () => { setSelectedCard(m); setDetailOpen(true); };
                return (
                  <div
                    key={m.id}
                    role="button"
                    tabIndex={0}
                    onClick={openDetail}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openDetail(); }}
                    className="w-full border border-[#eaeaea] rounded-lg px-3 py-2.5 hover:border-[#ccc] transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-semibold text-[#0a0a0a] truncate">{m.title}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); openDetail(); }}
                        className="flex items-center justify-center shrink-0 w-6 h-6 rounded-md bg-[#0a0a0a] text-white hover:bg-[#333] transition-colors"
                        aria-label="Edit"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                    {m.meetingTime && (
                      <p className="text-xs text-[#999] mt-1.5">{formatMeetingTimeRange(m.meetingTime, m.duration)}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Building2 className="w-3 h-3 text-[#bbb] shrink-0" />
                      <p className="flex-1 min-w-0 text-xs text-[#666] truncate">{company}</p>
                    </div>
                    {m.assignees && m.assignees.length > 0 && (
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <Users className="w-3 h-3 text-[#bbb] shrink-0 mt-0.5" />
                        <p className="text-xs text-[#666] leading-snug">{m.assignees.join(", ")}</p>
                      </div>
                    )}
                  </div>
                );
              })}
              {selectedOutlook.map((e) => {
                const company = resolveEventCompany(e);
                const people = e.attendees ?? [];
                const openDetail = () => { setSelectedOutlookEvent(e); setOutlookDetailOpen(true); };
                return (
                  <div
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    onClick={openDetail}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") openDetail(); }}
                    className="w-full border border-[#eaeaea] rounded-lg px-3 py-2.5 hover:border-[#ccc] transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-semibold text-[#0a0a0a] truncate">{e.title}</p>
                      </div>
                      <button
                        onClick={(ev) => { ev.stopPropagation(); openDetail(); }}
                        className="flex items-center justify-center shrink-0 w-6 h-6 rounded-md bg-[#0a0a0a] text-white hover:bg-[#333] transition-colors"
                        aria-label="Edit"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-xs text-[#999] mt-1.5">{formatOutlookTimeRange(e.start, e.end, e.isAllDay)}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Building2 className="w-3 h-3 text-[#bbb] shrink-0" />
                      <p className="flex-1 min-w-0 text-xs text-[#666] truncate">{company}</p>
                    </div>
                    {people.length > 0 && (
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <Users className="w-3 h-3 text-[#bbb] shrink-0 mt-0.5" />
                        <p className="text-xs text-[#666] leading-snug">{people.map((p) => p.name || p.email).join(", ")}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
      </div>

      <TaskDetailDrawer
        card={selectedCard}
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedCard(null); }}
        onUpdate={async (id, patch) => { await updateTask(id, patch); }}
        onDelete={async (id) => { await removeTask(id); }}
      />
      <OutlookEventDetailDrawer
        event={selectedOutlookEvent}
        open={outlookDetailOpen}
        onClose={() => { setOutlookDetailOpen(false); setSelectedOutlookEvent(null); }}
      />
    </div>
  );
}
