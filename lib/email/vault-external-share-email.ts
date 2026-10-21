import { escapeHtml } from "./escape-html";

/**
 * "Login details for X, from Y at Atlantis Utility", to someone outside the
 * company.
 *
 * The credential itself is never in the mail. Inboxes are forwarded,
 * searched, synced to phones and kept for years; a link that stops working
 * on a date the sender picked is the whole point of sending one instead of
 * pasting the password. The recipient opens it and the page shows the
 * details, in the app's own look.
 *
 * Laid out with tables and inline styles, which is what Outlook and Gmail
 * actually render; no SVG (Gmail strips it), so the mark is a character.
 */
export function buildVaultExternalShareEmail(opts: {
  entryName: string;
  recipientName?: string | null;
  senderName: string;
  senderEmail: string;
  message?: string | null;
  url: string;
  /** Already formatted for the sender's zone, e.g. "Thursday, October 23 at 3:00 PM EDT". */
  expiresLabel: string;
  maxViews: number | null;
}): { subject: string; html: string } {
  const entry = escapeHtml(opts.entryName);
  const to = opts.recipientName?.trim() ? escapeHtml(opts.recipientName.trim().split(/\s+/)[0]) : null;
  const sender = escapeHtml(opts.senderName);
  const senderEmail = escapeHtml(opts.senderEmail);
  const url = escapeHtml(opts.url);
  const expires = escapeHtml(opts.expiresLabel);
  const message = opts.message?.trim() ? escapeHtml(opts.message.trim()).replace(/\n/g, "<br>") : null;

  const subject = `${opts.senderName} shared login details for ${opts.entryName} with you`;

  const limits =
    opts.maxViews === null
      ? `This link stops working on <strong style="color:#0a0a0a;">${expires}</strong>.`
      : opts.maxViews === 1
        ? `This link can be opened <strong style="color:#0a0a0a;">once</strong>, and stops working on <strong style="color:#0a0a0a;">${expires}</strong> either way.`
        : `This link can be opened <strong style="color:#0a0a0a;">${opts.maxViews} times</strong>, and stops working on <strong style="color:#0a0a0a;">${expires}</strong> either way.`;

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#fafafa;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">Secure link to the login details for ${entry}. It expires ${expires}.</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a;">
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="32" height="32" align="center" valign="middle" style="background:#0a0a0a;border-radius:9px;color:#ffffff;font-size:13px;line-height:32px;">&#9650;</td>
                    <td style="padding-left:10px;font-size:17px;font-weight:600;letter-spacing:-0.2px;color:#0a0a0a;">Atlantis Utility</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #eaeaea;border-radius:16px;padding:32px;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#999;">Secure share</p>
                <h1 style="margin:0 0 20px;font-size:20px;line-height:1.3;font-weight:600;color:#0a0a0a;">Login details for ${entry}</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#333;">${to ? `Hi ${to},` : "Hello,"}</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#333;">
                  ${sender} at Atlantis Utility has shared the login details for <strong style="color:#0a0a0a;">${entry}</strong> with you.
                  Open the secure link below to view them.
                </p>
                ${
                  message
                    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="border-left:3px solid #0a0a0a;background:#fafafa;border-radius:0 8px 8px 0;padding:12px 16px;font-size:14px;line-height:1.55;color:#444;">
                      <span style="display:block;font-size:11px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:#999;margin-bottom:4px;">Message from ${sender}</span>
                      ${message}
                    </td>
                  </tr>
                </table>`
                    : ""
                }
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;">
                  <tr>
                    <td style="background:#0a0a0a;border-radius:10px;">
                      <a href="${url}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">View login details</a>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-top:1px solid #f0f0f0;padding-top:18px;font-size:13px;line-height:1.55;color:#666;">
                      ${limits}
                      The details aren&rsquo;t in this email, only behind the link, so please don&rsquo;t forward it.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 8px 0;font-size:12px;line-height:1.55;color:#999;">
                If the button doesn&rsquo;t work, paste this into your browser:<br>
                <span style="color:#0070f3;word-break:break-all;">${url}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 8px 0;font-size:12px;line-height:1.55;color:#999;">
                Not expecting this? You can ignore it, or reply to ${sender} at <a href="mailto:${senderEmail}" style="color:#999;">${senderEmail}</a>.
              </td>
            </tr>
            <tr>
              <td style="padding:24px 8px 0;font-size:12px;color:#bbb;">Atlantis Utility</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html };
}
