// Consolidated PDF export listing every resolved/closed ticket.

import type { UnifiedTicket } from "@/lib/tickets/useUnifiedTickets";
import { buildTicketsReportData, TICKETS_REPORT_FILE_BASE_NAME } from "./tickets-report";

const MARGIN = 14;

export async function exportTicketsReportPdf(tickets: UnifiedTicket[]): Promise<void> {
  const [{ default: jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const data = buildTicketsReportData(tickets);
  const doc = new jsPDF({ orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = MARGIN;

  // ── Letterhead ──────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(10, 10, 10);
  doc.text("Atlantis Utility", MARGIN, y);
  y += 7;
  doc.setFontSize(12);
  doc.text("Ticket Resolution Report", MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `Generated ${new Date(data.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
    MARGIN,
    y
  );
  y += 4;
  doc.setDrawColor(230);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 8;

  // ── Summary ─────────────────────────────────────────────────
  const bySourceText = Object.entries(data.summary.bySource)
    .map(([source, count]) => `${count} ${source}`)
    .join(", ");
  doc.setFontSize(9.5);
  doc.setTextColor(60);
  doc.text(
    `${data.summary.totalCompleted} tickets resolved or closed${bySourceText ? ` (${bySourceText})` : ""}.`,
    MARGIN,
    y
  );
  y += 8;

  // ── Ticket list ─────────────────────────────────────────────
  if (data.tickets.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Subject", "Requester", "Assignee", "Priority", "Status", "Source", "Resolved On"]],
      body: data.tickets.map((t) => [
        t.subject, t.requester, t.assigneeName, t.priorityLabel, t.statusLabel, t.sourceLabel, t.resolvedDate,
      ]),
      styles: { fontSize: 7.5 },
      headStyles: { fillColor: [10, 10, 10] },
      margin: { left: MARGIN, right: MARGIN },
    });
  } else {
    doc.setFont("helvetica", "italic");
    doc.setTextColor(180);
    doc.text("No resolved or closed tickets recorded yet.", MARGIN, y);
  }

  doc.save(`${TICKETS_REPORT_FILE_BASE_NAME}.pdf`);
}
