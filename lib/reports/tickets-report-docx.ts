// Consolidated Word export listing every resolved/closed ticket.

import type { UnifiedTicket } from "@/lib/tickets/useUnifiedTickets";
import { downloadBlob } from "@/lib/export";
import { buildTicketsReportData, TICKETS_REPORT_FILE_BASE_NAME } from "./tickets-report";

export async function exportTicketsReportDocx(tickets: UnifiedTicket[]): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = await import("docx");

  const data = buildTicketsReportData(tickets);

  const bySourceText = Object.entries(data.summary.bySource)
    .map(([source, count]) => `${count} ${source}`)
    .join(", ");

  const headers = ["Subject", "Requester", "Assignee", "Priority", "Status", "Source", "Resolved On"];
  const ticketTableRows =
    data.tickets.length > 0
      ? [
          new TableRow({
            tableHeader: true,
            children: headers.map((h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })),
          }),
          ...data.tickets.map(
            (t) =>
              new TableRow({
                children: [t.subject, t.requester, t.assigneeName, t.priorityLabel, t.statusLabel, t.sourceLabel, t.resolvedDate].map(
                  (v) => new TableCell({ children: [new Paragraph(v)] })
                ),
              })
          ),
        ]
      : [];

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: "Atlantis Utility", bold: true, size: 32 })] }),
          new Paragraph({ children: [new TextRun({ text: "Ticket Resolution Report", size: 26 })], spacing: { after: 100 } }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated ${new Date(data.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
                color: "999999",
                size: 18,
              }),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun({
                text: `${data.summary.totalCompleted} tickets resolved or closed${bySourceText ? ` (${bySourceText})` : ""}.`,
                color: "666666",
              }),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Resolved & Closed Tickets" }),
          ...(data.tickets.length > 0
            ? [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: ticketTableRows })]
            : [new Paragraph({ children: [new TextRun({ text: "No resolved or closed tickets recorded yet.", italics: true, color: "999999" })] })]),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(`${TICKETS_REPORT_FILE_BASE_NAME}.docx`, blob);
}
