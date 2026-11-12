import { escapeHtml } from "./escape-html";

/**
 * "This ticket is yours now", and a link straight to it.
 *
 * Assigning a ticket was silent. The in-app notification list is no help
 * here - lib/notifications keeps it in localStorage, so a notification
 * raised in one person's browser never reaches the person it is about -
 * which leaves email as the only channel that actually arrives.
 *
 * It carries what somebody needs to decide whether to stop what they are
 * doing: who it is for, whose ticket it was, how urgent, and the subject
 * line. Not the conversation itself - a customer's problem has no business
 * being copied into a second inbox - so the link is where the detail is,
 * behind the sign-in that governs it.
 */

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Urgent earns a red chip; the rest are grey. A page of red says nothing. */
const PRIORITY_COLOR: Record<string, string> = {
  urgent: "#d93025",
  high: "#b26b00",
};

export function buildTicketAssignedEmail(opts: {
  /** The ticket's subject line. */
  subject: string;
  /** Manual tickets carry a number; email threads don't. */
  ticketNumber?: number | null;
  /** First name is enough; the mail is to a colleague. */
  toName?: string | null;
  /** Who assigned it. */
  fromName?: string | null;
  /** The customer it's about, when one is recorded. */
  customerName?: string | null;
  priority?: string | null;
  /** Self-assignment is filtered out before this; a reassignment is not. */
  previousAssigneeName?: string | null;
  url: string;
}): { subject: string; html: string } {
  const rawSubject = opts.subject.trim() || "a ticket";
  const ref = opts.ticketNumber ? `#${opts.ticketNumber}` : "";
  const priority = (opts.priority ?? "").toLowerCase();
  const urgent = priority === "urgent";

  // The number goes in the subject line because it is how everyone refers to
  // these out loud, and an inbox of them is unsearchable without it. Only
  // "urgent" earns a prefix - if every assignment shouts, none of them does.
  const lead = urgent ? "Urgent — assigned to you" : "Assigned to you";
  const subject = `${lead}: ${ref ? `${ref} ` : ""}${rawSubject}`;

  const to = opts.toName ? escapeHtml(opts.toName.split(" ")[0]) : null;
  const from = opts.fromName ? escapeHtml(opts.fromName) : "Someone";
  const safeSubject = escapeHtml(rawSubject);
  const url = escapeHtml(opts.url);
  const customer = opts.customerName?.trim() ? escapeHtml(opts.customerName.trim()) : null;
  const priorityLabel = PRIORITY_LABEL[priority] ?? null;
  const priorityColor = PRIORITY_COLOR[priority] ?? "#666";
  const previous = opts.previousAssigneeName?.trim()
    ? escapeHtml(opts.previousAssigneeName.trim())
    : null;

  const rows: string[] = [];
  if (ref) rows.push(`<tr><td style="padding:2px 12px 2px 0;color:#888;">Ticket</td><td style="padding:2px 0;">${escapeHtml(ref)}</td></tr>`);
  if (customer) rows.push(`<tr><td style="padding:2px 12px 2px 0;color:#888;">Customer</td><td style="padding:2px 0;">${customer}</td></tr>`);
  if (priorityLabel) {
    rows.push(
      `<tr><td style="padding:2px 12px 2px 0;color:#888;">Priority</td><td style="padding:2px 0;color:${priorityColor};font-weight:600;">${priorityLabel}</td></tr>`,
    );
  }
  if (previous) {
    rows.push(
      `<tr><td style="padding:2px 12px 2px 0;color:#888;">Was with</td><td style="padding:2px 0;">${previous}</td></tr>`,
    );
  }

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0a0a0a;">
      <p style="font-size:15px;line-height:1.5;">${to ? `Hi ${to},` : "Hello,"}</p>
      <p style="font-size:15px;line-height:1.5;">
        ${from} has assigned a support ticket to you on the Atlantis Utility app:
      </p>
      <p style="font-size:15px;line-height:1.5;font-weight:600;margin:0 0 14px;">${safeSubject}</p>
      ${rows.length ? `<table style="font-size:13px;line-height:1.6;border-collapse:collapse;margin:0 0 4px;">${rows.join("")}</table>` : ""}
      <p style="margin:28px 0;">
        <a href="${url}"
           style="background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block;">
          Open the ticket
        </a>
      </p>
      <p style="font-size:13px;line-height:1.5;color:#666;">
        You'll need to be signed in. If the link doesn't open, copy this into your browser:<br>
        <span style="color:#0070f3;word-break:break-all;">${url}</span>
      </p>
      <p style="font-size:12px;line-height:1.5;color:#999;margin-top:28px;">
        Sent by the Atlantis Utility app because a ticket was assigned to you.
      </p>
    </div>
  `;

  return { subject, html };
}
