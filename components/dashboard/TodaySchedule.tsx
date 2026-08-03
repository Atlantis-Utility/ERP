"use client";

import { useState } from "react";
import { Video, Clock } from "lucide-react";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function TodaySchedule({ cards }: { cards: KanbanCard[] }) {
  const [selected, setSelected] = useState(() => ymd(new Date()));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 3 + i);
    return d;
  });

  const meetings = cards
    .filter((c) => c.type === "meeting" && c.meetingDate === selected)
    .sort((a, b) => (a.meetingTime || "").localeCompare(b.meetingTime || ""));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b border-[#f4f4f4] shrink-0">
        {days.map((d) => {
          const key = ymd(d);
          const isSelected = key === selected;
          const isToday = key === ymd(new Date());
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className={`flex flex-col items-center gap-0.5 w-9 py-1.5 rounded-lg transition-colors ${
                isSelected ? "bg-[#0a0a0a] text-white" : isToday ? "text-[#0070f3] hover:bg-[#fafafa]" : "text-[#666] hover:bg-[#fafafa]"
              }`}
            >
              <span className="text-sm font-semibold">{d.getDate()}</span>
              <span className="text-[9px] uppercase tracking-wide">{d.toLocaleDateString("en-US", { weekday: "short" })}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {meetings.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-[#999]">No meetings scheduled</div>
        ) : (
          meetings.map((m) => (
            <div key={m.id} className="border border-[#eaeaea] rounded-lg px-4 py-3 hover:border-[#ccc] transition-colors">
              <div className="flex items-center gap-2">
                <Video className="w-3.5 h-3.5 text-[#0070f3] shrink-0" />
                <p className="text-sm font-semibold text-[#0a0a0a] truncate">{m.title}</p>
              </div>
              {m.meetingTime && (
                <p className="text-xs text-[#999] mt-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {m.meetingTime}{m.duration ? ` · ${m.duration}m` : ""}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
