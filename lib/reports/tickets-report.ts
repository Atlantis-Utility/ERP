// Shared, plain-data shape for the consolidated "Resolved/Closed Tickets" report —
// consumed identically by the in-app preview, PDF exporter, and Word exporter.

import type { UnifiedTicket } from "@/lib/tickets/useUnifiedTickets";
import { formatDate } from "@/lib/utils";

export interface ReportTicketEntry {
  subject: string;
  requester: string;
  assigneeName: string;
  priorityLabel: string;
  statusLabel: string;
  sourceLabel: string;
  resolvedDate: string;
}

export interface TicketsReportData {
  generatedAt: string;
  summary: { totalCompleted: number; bySource: Record<string, number> };
  tickets: ReportTicketEntry[];
}

export const TICKETS_REPORT_FILE_BASE_NAME = "ticket-resolution-report";

const priorityLabel: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const statusLabel: Record<string, string> = {
  open: "Open",
  "in-progress": "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const sourceLabel: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  web: "Web",
  manual: "Manual",
};

export function buildTicketsReportData(allTickets: UnifiedTicket[]): TicketsReportData {
  const completed = allTickets.filter((t) => t.status === "resolved" || t.status === "closed");

  const tickets: ReportTicketEntry[] = completed
    .map((t) => ({
      subject: t.subject,
      requester: t.fromName || t.from || "—",
      assigneeName: t.assigneeName || "Unassigned",
      priorityLabel: priorityLabel[t.priority] ?? t.priority,
      statusLabel: statusLabel[t.status] ?? t.status,
      sourceLabel: sourceLabel[t.source] ?? t.source,
      resolvedDate: formatDate(t.updatedAt ?? t.receivedAt),
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  const bySource: Record<string, number> = {};
  for (const t of completed) {
    bySource[t.source] = (bySource[t.source] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: { totalCompleted: completed.length, bySource },
    tickets,
  };
}
