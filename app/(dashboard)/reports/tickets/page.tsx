"use client";

import ReportDocument from "@/components/reports/ReportDocument";
import TicketReportPreview from "@/components/reports/TicketReportPreview";
import { useUnifiedTickets } from "@/lib/tickets/useUnifiedTickets";
import { exportTicketsReportPdf } from "@/lib/reports/tickets-report-pdf";
import { exportTicketsReportDocx } from "@/lib/reports/tickets-report-docx";

export default function TicketsReportPage() {
  const { tickets } = useUnifiedTickets();

  return (
    <ReportDocument
      backHref="/reports"
      backLabel="Back to Reports"
      reportLabel="Ticket Resolution Report"
      title="Ticket Resolution Report"
      subtitle="A consolidated report of every resolved and closed support ticket"
      onDownloadPdf={() => exportTicketsReportPdf(tickets)}
      onDownloadWord={() => exportTicketsReportDocx(tickets)}
    >
      <TicketReportPreview tickets={tickets} />
    </ReportDocument>
  );
}
