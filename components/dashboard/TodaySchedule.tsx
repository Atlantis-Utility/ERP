"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Video, Clock, CalendarPlus, MapPin } from "lucide-react";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";
import type { OutlookEvent } from "@/components/tasks/OutlookEventDetailDrawer";

function ymd(d: Date): string {
  // Local date, not toISOString: at 6pm Pacific the UTC date is already
  // tomorrow, which would put today's meetings under the wrong day.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Matches the Calendar page: Graph sends a local date-time, so the day is its first ten characters. */
function outlookDateStr(start: string): string {
  return start.length === 10 ? start : start.slice(0, 10);
}

function outlookTimeLabel(event: OutlookEvent): string {
  if (event.isAllDay) return "All day";
  const start = new Date(event.start);
  if (isNaN(start.getTime())) return "";
  const from = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const end = new Date(event.end);
  if (isNaN(end.getTime())) return from;
  return `${from} – ${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/** A meeting from either source, in the order the day runs. */
interface ScheduleItem {
  key: string;
  title: string;
  timeLabel: string;
  /** Sorts the day. "" for an all-day item, which comes first. */
  sortKey: string;
  fromOutlook: boolean;
  joinUrl?: string | null;
  location?: string | null;
}

/**
 * The dashboard's schedule strip.
 *
 * It used to list only meetings created on the task board, so a calendar
 * full of Outlook meetings still read "No meetings scheduled". It reads the
 * same Graph route the Calendar page does, over the week the strip covers,
 * and merges the two sources.
 */
export default function TodaySchedule({ cards }: { cards: KanbanCard[] }) {
  const [selected, setSelected] = useState(() => ymd(new Date()));
  const [events, setEvents] = useState<OutlookEvent[]>([]);
  const [connected, setConnected] = useState(true);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - 3 + i);
        return d;
      }),
    [],
  );

  const weekKey = `${ymd(days[0])}:${ymd(days[6])}`;

  useEffect(() => {
    let cancelled = false;

    // Everything here runs in the async body rather than the effect's own, so
    // none of it is a synchronous setState during an effect.
    (async () => {
      // Painted from the last visit first, then refreshed, so the strip isn't
      // blank while Microsoft is asked. Same approach as the Calendar page.
      try {
        const cached = localStorage.getItem(`sc:outlook:week:${weekKey}`);
        if (cached && !cancelled) setEvents(JSON.parse(cached) as OutlookEvent[]);
      } catch {
        // A bad cache entry is not worth reporting; the fetch below replaces it.
      }

      // Microsoft is connected as part of signing in (see lib/auth-context.tsx),
      // so this is the same cookie every other consumer checks.
      if (!document.cookie.includes("outlook_connected=1")) {
        if (!cancelled) setConnected(false);
        return;
      }

      try {
        const from = new Date(days[0]);
        from.setHours(0, 0, 0, 0);
        const to = new Date(days[6]);
        to.setHours(23, 59, 59, 999);
        const res = await fetch(
          `/api/outlook-calendar/events?timeMin=${encodeURIComponent(from.toISOString())}&timeMax=${encodeURIComponent(to.toISOString())}`,
        );
        if (cancelled) return;
        if (res.status === 401) {
          setConnected(false);
          return;
        }
        const data = (await res.json()) as { events?: OutlookEvent[] };
        if (cancelled) return;
        setConnected(true);
        setEvents(data.events ?? []);
        try {
          localStorage.setItem(`sc:outlook:week:${weekKey}`, JSON.stringify(data.events ?? []));
        } catch {
          // Over quota: the strip still works, it just won't paint instantly
          // next time.
        }
      } catch {
        // Offline or Graph is down. Whatever was cached stays on screen, and
        // the meetings created in-app still show.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [weekKey, days]);

  const meetings: ScheduleItem[] = useMemo(() => {
    const internal = cards
      .filter((c) => c.type === "meeting" && c.meetingDate === selected)
      .map((c) => ({
        key: c.id,
        title: c.title,
        timeLabel: c.meetingTime ? `${c.meetingTime}${c.duration ? ` · ${c.duration}m` : ""}` : "",
        sortKey: c.meetingTime || "",
        fromOutlook: false,
        joinUrl: c.meetingUrl,
      }));

    const outlook = events
      .filter((e) => outlookDateStr(e.start) === selected)
      .map((e) => ({
        key: `outlook-${e.id}`,
        title: e.title,
        timeLabel: outlookTimeLabel(e),
        sortKey: e.isAllDay ? "" : e.start.slice(11, 16),
        fromOutlook: true,
        joinUrl: e.onlineJoinUrl,
        location: e.location,
      }));

    return [...internal, ...outlook].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [cards, events, selected]);

  const countFor = (key: string) =>
    cards.filter((c) => c.type === "meeting" && c.meetingDate === key).length +
    events.filter((e) => outlookDateStr(e.start) === key).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b border-[#f4f4f4] shrink-0">
        {days.map((d) => {
          const key = ymd(d);
          const isSelected = key === selected;
          const isToday = key === ymd(new Date());
          const count = countFor(key);
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className={`relative flex flex-col items-center gap-0.5 w-9 py-1.5 rounded-lg transition-colors ${
                isSelected
                  ? "bg-[#0a0a0a] text-white"
                  : isToday
                    ? "text-[#0070f3] hover:bg-[#fafafa]"
                    : "text-[#666] hover:bg-[#fafafa]"
              }`}
            >
              <span className="text-sm font-semibold">{d.getDate()}</span>
              <span className="text-[9px] uppercase tracking-wide">
                {d.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              {/* A day with something on it, so the week reads at a glance
                  rather than needing a click each. */}
              {count > 0 && (
                <span
                  className={`absolute bottom-0.5 w-1 h-1 rounded-full ${isSelected ? "bg-white" : "bg-[#0070f3]"}`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {meetings.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-4">
            <p className="text-sm text-[#999]">No meetings scheduled</p>
            {/* "Nothing today" and "your calendar isn't connected" are
                different answers, and the second one is actionable. */}
            {!connected && (
              <Link href="/calendar" className="text-xs text-[#0070f3] hover:underline">
                Connect your Outlook calendar
              </Link>
            )}
          </div>
        ) : (
          meetings.map((m) => (
            <div
              key={m.key}
              className="border border-[#eaeaea] rounded-lg px-4 py-3 hover:border-[#ccc] transition-colors"
            >
              <div className="flex items-center gap-2">
                {m.fromOutlook ? (
                  <CalendarPlus className="w-3.5 h-3.5 text-[#7c3aed] shrink-0" />
                ) : (
                  <Video className="w-3.5 h-3.5 text-[#0070f3] shrink-0" />
                )}
                <p className="text-sm font-semibold text-[#0a0a0a] truncate">{m.title}</p>
              </div>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                {m.timeLabel && (
                  <p className="text-xs text-[#999] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {m.timeLabel}
                  </p>
                )}
                {m.location && (
                  <p className="text-xs text-[#999] flex items-center gap-1 min-w-0">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate max-w-40">{m.location}</span>
                  </p>
                )}
                {m.joinUrl && (
                  <a
                    href={m.joinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#0070f3] hover:underline"
                  >
                    Join
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
