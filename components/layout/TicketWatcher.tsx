"use client";

import { useEffect, useRef } from "react";
import { addTask } from "@/lib/db/tasks";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";
import { addNotification, TICKET_NOTIF_PREF_ID } from "@/lib/notifications";
import {
  subscribeSyncedTicketIds,
  markTicketSynced,
  isBaselineSeeded,
  markBaselineSeeded,
} from "@/lib/db/ticket-sync";

interface EmailTicket {
  id: string;
  fromName: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
}

const POLL_MS = 60_000;

function ticketToCard(ticket: EmailTicket): KanbanCard {
  return {
    id: `ticket-${ticket.id}`,
    type: "task",
    title: ticket.subject || "New support ticket",
    description: ticket.snippet || `From ${ticket.fromName || ticket.from}`,
    column: "backlog",
    priority: "medium",
    assignees: [],
    dueDate: "",
    dueDateTbd: true,
    tags: ["ticket"],
  };
}

// Mounted once at the dashboard-layout level (alongside DataPreloader) so it
// keeps watching for newly-arrived email tickets regardless of which page is
// open. New tickets get auto-added to the task board and surface as a
// per-user "unseen" notification that the Sidebar badge reads.
export default function TicketWatcher() {
  const syncedIds = useRef<Set<string> | null>(null);
  const baselineDone = useRef(false);
  const processing = useRef<Set<string>>(new Set());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    async function poll() {
      if (!syncedIds.current) return;

      let tickets: EmailTicket[];
      try {
        const res = await fetch("/api/tickets");
        const data = await res.json();
        if (data?.error || !Array.isArray(data?.tickets)) return;
        tickets = data.tickets;
      } catch {
        return;
      }

      if (!baselineDone.current) {
        baselineDone.current = true;
        if (!(await isBaselineSeeded())) {
          await Promise.all(tickets.map((t) => markTicketSynced(t.id)));
          await markBaselineSeeded();
          return;
        }
      }

      const known = syncedIds.current;
      const fresh = tickets.filter((t) => !known.has(t.id) && !processing.current.has(t.id));

      // Process tickets concurrently instead of one at a time — each ticket's own
      // two writes (mark synced, add task) still happen in order, but multiple
      // tickets arriving at once (e.g. after being offline) no longer serialize.
      await Promise.all(fresh.map(async (ticket) => {
        processing.current.add(ticket.id);
        try {
          await markTicketSynced(ticket.id);
          await addTask(ticketToCard(ticket));
          addNotification({
            prefId: TICKET_NOTIF_PREF_ID,
            icon: "system",
            title: "New ticket received",
            body: ticket.subject || `From ${ticket.fromName || ticket.from}`,
            href: `/tickets/${ticket.id}`,
            ticketId: ticket.id,
          });
        } catch (err) {
          console.error("[ticket-watcher]", err);
        } finally {
          processing.current.delete(ticket.id);
        }
      }));
    }

    const unsub = subscribeSyncedTicketIds((ids) => {
      const firstLoad = syncedIds.current === null;
      syncedIds.current = ids;
      if (firstLoad && !cancelled) {
        poll();
        interval = setInterval(poll, POLL_MS);
      }
    });

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      unsub();
    };
  }, []);

  return null;
}
