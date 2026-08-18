// Star links only pre-select a rating on the feedback page — they don't
// submit anything by themselves. Email security scanners (e.g. Outlook Safe
// Links) "pre-click" links to check them for safety, so a link that recorded
// a rating on GET would silently corrupt real ratings; the page requires an
// explicit confirm click before it POSTs anything.
function starLink(appUrl: string, token: string, rating: number): string {
  return `${appUrl}/feedback/${token}?rating=${rating}`;
}

export function buildTicketReviewEmail(opts: {
  customerName: string;
  subject: string;
  token: string;
  appUrl: string;
}): { subject: string; html: string } {
  const { customerName, subject, token, appUrl } = opts;

  const stars = [1, 2, 3, 4, 5]
    .map(
      (n) => `
        <a href="${starLink(appUrl, token, n)}" style="display:inline-block;margin:0 6px;padding:10px 16px;background:#f5f5f5;border-radius:8px;text-decoration:none;color:#0a0a0a;font-size:16px;font-weight:600;">
          ${"★".repeat(n)} ${n}
        </a>`
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0a;">
      <p>Hi ${customerName},</p>
      <p>Thank you for reaching out to Atlantis Utility. This is a quick note to confirm that your support ticket, "${subject}," has been marked as resolved.</p>
      <p>If anything still isn't quite right, just reply to this email and we'll take another look right away.</p>
      <p>We'd also really appreciate 30 seconds of your time to tell us how we did:</p>
      <div style="text-align:center;margin:24px 0;">${stars}</div>
      <p>Thank you for choosing Atlantis Utility.</p>
      <p>Best regards,<br/>Atlantis Utility Support Team</p>
    </div>
  `;

  return { subject: "Your ticket has been resolved — how did we do?", html };
}
