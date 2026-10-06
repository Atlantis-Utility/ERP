"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckSquare, TicketCheck } from "lucide-react";
import { subscribeTasks } from "@/lib/db/tasks";
import { useUnifiedTickets } from "@/lib/tickets/useUnifiedTickets";
import { useVisibility } from "@/lib/visibility";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";

/**
 * The tickets and tasks with this person's name on them.
 *
 * One panel rather than two, because for anybody who holds both these are
 * the same question: what am I supposed to be doing. Which halves appear
 * follows the pages they hold, so a ticket-only account gets tickets and
 * nothing about tasks.
 */
export default function MyWork({ tickets: withTickets, tasks: withTasks }: { tickets: boolean; tasks: boolean }) {
  const { isMine, seesAll } = useVisibility();
  const { tickets } = useUnifiedTickets();
  const [cards, setCards] = useState<KanbanCard[]>([]);

  useEffect(() => {
    if (!withTasks) return;
    return subscribeTasks(setCards);
  }, [withTasks]);

  // "Mine" by assignee name, the same rule the Tickets and Tasks pages use.
  // An administrator sees everything there, so they do here too.
  const myTickets = withTickets ? tickets.filter((t) => isMine([t.assigneeName])) : [];
  const openTickets = myTickets.filter((t) => t.status === "open" || t.status === "in-progress");
  const myTasks = withTasks
    ? cards.filter((c) => c.type !== "project" && c.column !== "done" && isMine(c.assignees))
    : [];

  // Soonest first, and anything with no date last: a list of work is read
  // top down and the thing due today belongs at the top.
  const nextTasks = [...myTasks]
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))
    .slice(0, 5);
  const nextTickets = [...openTickets]
    .sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || ""))
    .slice(0, 5);

  const nothing = (withTickets ? openTickets.length : 0) + (withTasks ? myTasks.length : 0) === 0;

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-2 gap-px bg-[#f4f4f4] border-b border-[#f4f4f4] shrink-0">
        {withTickets && (
          <Link href="/tickets" className="bg-white px-5 py-4 hover:bg-[#fafafa] transition-colors">
            <p className="text-xl font-bold tabular-nums leading-none text-[#0a0a0a]">{openTickets.length}</p>
            <p className="text-[10px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">
              {seesAll ? "Open tickets" : "My open tickets"}
            </p>
          </Link>
        )}
        {withTasks && (
          <Link href="/tasks" className="bg-white px-5 py-4 hover:bg-[#fafafa] transition-colors">
            <p className="text-xl font-bold tabular-nums leading-none text-[#0a0a0a]">{myTasks.length}</p>
            <p className="text-[10px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">
              {seesAll ? "Open tasks" : "My open tasks"}
            </p>
          </Link>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
        {nothing ? (
          <div className="text-center py-8">
            <CheckSquare className="w-5 h-5 text-[#ddd] mx-auto mb-2" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-0.5">Nothing assigned to you</p>
            <p className="text-xs text-[#999]">Tickets and tasks with your name on them show up here.</p>
          </div>
        ) : (
          <>
            {nextTickets.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#bbb] uppercase tracking-wider mb-2">Tickets</p>
                <div className="space-y-1">
                  {nextTickets.map((t) => (
                    <Link
                      key={t.id}
                      href={`/tickets/${t.id}`}
                      className="flex items-center gap-2 px-2 py-1.5 -mx-2 rounded-lg hover:bg-[#fafafa] transition-colors"
                    >
                      <TicketCheck className="w-3.5 h-3.5 text-[#bbb] shrink-0" />
                      <span className="flex-1 min-w-0 text-[12px] text-[#0a0a0a] truncate">{t.subject}</span>
                      <span className="text-[10px] font-medium text-[#999] shrink-0 capitalize">
                        {t.status.replace("-", " ")}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {nextTasks.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#bbb] uppercase tracking-wider mb-2">Tasks</p>
                <div className="space-y-1">
                  {nextTasks.map((c) => (
                    <Link
                      key={c.id}
                      href={`/tasks?task=${encodeURIComponent(c.id)}`}
                      className="flex items-center gap-2 px-2 py-1.5 -mx-2 rounded-lg hover:bg-[#fafafa] transition-colors"
                    >
                      <CheckSquare className="w-3.5 h-3.5 text-[#bbb] shrink-0" />
                      <span className="flex-1 min-w-0 text-[12px] text-[#0a0a0a] truncate">{c.title}</span>
                      <span className="text-[10px] tabular-nums text-[#999] shrink-0">
                        {c.dueDateTbd || !c.dueDate ? "No date" : c.dueDate}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="px-5 py-3 border-t border-[#f4f4f4] shrink-0">
        <Link
          href={withTickets ? "/tickets" : "/tasks"}
          className="flex items-center gap-1 text-xs text-[#666] hover:text-[#0a0a0a] transition-colors font-medium"
        >
          {withTickets ? "Open tickets" : "Open tasks"} <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
