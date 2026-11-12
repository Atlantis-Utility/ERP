"use client";

/**
 * "Let them know" after handing somebody a ticket.
 *
 * Never throws: the assignment itself has already been written by the time
 * this runs, and failing to send the heads-up is not a reason to tell
 * somebody their save didn't work. Returns a line to show, or "" when there
 * is nothing worth saying - assigning a ticket to yourself included.
 */
export async function notifyTicketAssigned(opts: {
  toEmployeeId: string;
  toName?: string;
  ticketId: string;
  /** "email" for a Graph thread, anything else for a manual ticket. */
  source: string;
  subject: string;
  customerName?: string;
  priority?: string;
  previousAssigneeName?: string;
}): Promise<string> {
  try {
    const res = await fetch("/api/notify/ticket-assignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toEmployeeId: opts.toEmployeeId,
        ticketId: opts.ticketId,
        source: opts.source,
        subject: opts.subject,
        customerName: opts.customerName,
        priority: opts.priority,
        previousAssigneeName: opts.previousAssigneeName,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { sent?: boolean; error?: string };

    if (res.ok && data.sent) return `Emailed ${opts.toName ?? "them"}.`;
    if (res.ok) return ""; // assigned to yourself, or the ticket doesn't agree
    if (data.error === "EMAIL_NOT_CONFIGURED") return "Assigned, but email isn't set up on this server.";
    if (data.error === "NO_EMAIL_ON_FILE") {
      return `Assigned, but ${opts.toName ?? "they"} ${opts.toName ? "has" : "have"} no email address on file.`;
    }
    return "Assigned, but the email couldn't be sent.";
  } catch {
    return "Assigned, but the email couldn't be sent.";
  }
}
