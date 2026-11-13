import { escapeHtml } from "./escape-html";

/**
 * "We have your request" — the first thing a customer hears back.
 *
 * It goes out automatically, within minutes of their email landing in the
 * ticket mailbox, and before anyone here has read a word of it. So it
 * promises only what is true: that the message arrived and that a person
 * will follow. No ticket number (an email thread doesn't have one), and no
 * guess at a response time nobody has committed to.
 *
 * Four lines, deliberately. It is a receipt, not a letter: anything longer
 * is read as the answer and isn't one. It's sent as a reply inside the
 * customer's own thread (lib/tickets/acknowledge.ts), which already quotes
 * what they wrote underneath - so repeating their subject back at them here
 * would just be padding, and a reply lands on the same ticket without being
 * told to.
 */
export function buildTicketAcknowledgementEmail(opts: {
  /** Their name if the mail carried one; without it, no greeting by name. */
  customerName?: string | null;
}): { subject: string; html: string } {
  const name = opts.customerName?.trim();
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hello,";

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;color:#0a0a0a;font-size:15px;line-height:1.6;">
      <p>${greeting}</p>
      <p>We've received your request and opened a ticket for it. One of our representatives will be in touch shortly.</p>
      <p>Thanks,<br/>Support Team<br/>Atlantis Utility</p>
    </div>
  `;

  return { subject: "We've received your request", html };
}
