"use client";

// Shared, read-only view over both ticket sources (email + manual) for
// consumers outside the main Tickets page (Tasks board, Reports) — a smaller,
// dependency-free echo of the merge app/(dashboard)/tickets/page.tsx does for
// its own richer UI (pagination, cache, assign modal), which isn't touched here.

import { useEffect, useMemo, useState } from "react";
import { subscribeManualTickets, subscribeAllTicketMeta } from "@/lib/db/tickets";
import type { ManualTicket, TicketMeta, TicketStatus, TicketPriority } from "@/lib/db/tickets";

export interface UnifiedTicket {
  id: string;
  source: "email" | "phone" | "web" | "manual";
  subject: string;
  fromName: string;
  from: string;
  description?: string;
  snippet?: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeName?: string;
  receivedAt: string;
  updatedAt?: string;
  ticketNumber?: number;
}

interface EmailTicketRaw {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  isUnread: boolean;
}

export function useUnifiedTickets(): { tickets: UnifiedTicket[]; notConfigured: boolean } {
  const [emailTickets, setEmailTickets] = useState<EmailTicketRaw[]>([]);
  const [manualTickets, setManualTickets] = useState<ManualTicket[]>([]);
  const [metaMap, setMetaMap] = useState<Record<string, TicketMeta>>({});
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchEmailTickets() {
      try {
        const res = await fetch("/api/tickets");
        const data = await res.json() as { tickets?: EmailTicketRaw[]; error?: string };
        if (cancelled) return;
        if (data.error === "not_configured") {
          setNotConfigured(true);
          setEmailTickets([]);
          return;
        }
        setNotConfigured(false);
        if (!data.error) setEmailTickets(data.tickets ?? []);
      } catch {
        // Keep last-known list on transient network errors.
      }
    }

    fetchEmailTickets();
    const interval = setInterval(fetchEmailTickets, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => subscribeManualTickets(setManualTickets), []);

  useEffect(() => subscribeAllTicketMeta((metas) => {
    setMetaMap(Object.fromEntries(metas.map((m) => [m.id, m])));
  }), []);

  const tickets: UnifiedTicket[] = useMemo(() => {
    const fromEmail: UnifiedTicket[] = emailTickets.map((t) => {
      const meta = metaMap[t.id];
      return {
        id: t.id,
        source: "email",
        subject: t.subject,
        fromName: t.fromName,
        from: t.from,
        snippet: t.snippet,
        receivedAt: t.receivedAt,
        updatedAt: meta?.updatedAt,
        status: meta?.status ?? "open",
        priority: meta?.priority ?? "medium",
        assigneeName: meta?.assigneeName,
      };
    });

    const fromManual: UnifiedTicket[] = manualTickets.map((t) => ({
      id: t.id,
      source: t.source,
      subject: t.subject,
      fromName: t.customerName,
      from: t.customerEmail ?? t.customerPhone ?? "",
      description: t.description,
      receivedAt: t.createdAt,
      updatedAt: t.updatedAt,
      ticketNumber: t.ticketNumber,
      status: t.status,
      priority: t.priority,
      assigneeName: t.assigneeName,
    }));

    return [...fromEmail, ...fromManual].sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );
  }, [emailTickets, manualTickets, metaMap]);

  return { tickets, notConfigured };
}
