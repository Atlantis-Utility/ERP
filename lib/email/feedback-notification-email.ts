import { escapeHtml } from "./escape-html";

// Internal "here's what the customer said" copy sent to the ticket's
// assignee + all admins once a review request is answered — separate from
// ticket-review-email.ts, which is the customer-facing ask for a rating.
export function buildFeedbackNotificationEmail(opts: {
  customerName: string;
  subject: string;
  rating: number;
  feedback: string | null;
  assigneeName: string | null;
}): { subject: string; html: string } {
  const customerName = escapeHtml(opts.customerName);
  const subject = escapeHtml(opts.subject);
  const feedback = opts.feedback ? escapeHtml(opts.feedback) : null;
  const assigneeName = opts.assigneeName ? escapeHtml(opts.assigneeName) : null;
  const { rating } = opts;

  const stars = `<span style="color:#d4af37;font-size:22px;letter-spacing:2px;">${"★".repeat(rating)}</span><span style="color:#ddd;font-size:22px;letter-spacing:2px;">${"★".repeat(5 - rating)}</span>`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0a;">
      <p>A customer responded to a review request for a closed ticket.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:4px 0;color:#666;">Customer</td><td style="padding:4px 0;font-weight:600;">${customerName || "—"}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Ticket</td><td style="padding:4px 0;font-weight:600;">${subject || "—"}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Assigned to</td><td style="padding:4px 0;font-weight:600;">${assigneeName || "Unassigned"}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Rating</td><td style="padding:4px 0;">${stars}</td></tr>
      </table>
      ${
        feedback
          ? `<p style="color:#666;margin-bottom:4px;">Feedback:</p><p style="background:#f5f5f5;border-radius:8px;padding:12px 16px;white-space:pre-wrap;">${feedback}</p>`
          : `<p style="color:#999;font-style:italic;">No additional comments left.</p>`
      }
    </div>
  `;

  return { subject: `Customer Feedback: ${rating}★ — ${opts.subject || "Ticket"}`, html };
}
