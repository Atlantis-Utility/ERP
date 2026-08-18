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
        <a href="${starLink(appUrl, token, n)}" style="display:inline-block;margin:0 8px;text-decoration:none;color:#d4af37;font-size:32px;line-height:1;">
          ★
        </a>`
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0a;">
      <p>Dear ${customerName},</p>
      <p>Thank you for contacting Atlantis Utility. This is to confirm that your support ticket, "${subject}," has been resolved.</p>
      <p>We'd appreciate a moment of your time to rate your recent experience with our support team:</p>
      <div style="text-align:center;margin:24px 0;">${stars}</div>
      <p>Thank you for being a valued Atlantis Utility customer.</p>
      <p>Sincerely,<br/>The Atlantis Utility Support Team</p>
    </div>
  `;

  return { subject: "Your Support Ticket Has Been Resolved", html };
}
