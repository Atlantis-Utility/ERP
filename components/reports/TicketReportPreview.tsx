"use client";

import { useMemo } from "react";
import type { UnifiedTicket } from "@/lib/tickets/useUnifiedTickets";
import { buildTicketsReportData } from "@/lib/reports/tickets-report";

export default function TicketReportPreview({ tickets }: { tickets: UnifiedTicket[] }) {
  const data = useMemo(() => buildTicketsReportData(tickets), [tickets]);

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#fafafa] border border-[#eaeaea] rounded-lg p-3 text-center">
          <p className="text-xl font-semibold text-[#0a0a0a]">{data.summary.totalCompleted}</p>
          <p className="text-[10px] text-[#999] uppercase tracking-wide mt-0.5">Resolved / Closed</p>
        </div>
        <div className="bg-[#fafafa] border border-[#eaeaea] rounded-lg p-3">
          <p className="text-[10px] text-[#999] uppercase tracking-wide mb-1">By Source</p>
          <p className="text-xs text-[#444]">
            {Object.entries(data.summary.bySource).length > 0
              ? Object.entries(data.summary.bySource).map(([source, count]) => `${count} ${source}`).join(", ")
              : "—"}
          </p>
        </div>
      </div>

      {/* Ticket list */}
      <div>
        <p className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2">Resolved & Closed Tickets</p>
        {data.tickets.length > 0 ? (
          <div className="space-y-2">
            {data.tickets.map((t, i) => (
              <div key={i} className="border border-[#eaeaea] rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#0a0a0a] truncate">{t.subject}</p>
                  <p className="text-xs text-[#999] mt-0.5">
                    {t.requester} · {t.assigneeName} · {t.sourceLabel} · Resolved {t.resolvedDate}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#e8fdf0] text-[#17c964]">{t.statusLabel}</span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#f1f1f1] text-[#666]">{t.priorityLabel}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#ccc] italic">No resolved or closed tickets recorded yet.</p>
        )}
      </div>
    </div>
  );
}
