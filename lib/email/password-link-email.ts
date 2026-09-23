import { escapeHtml } from "./escape-html";

/**
 * "Set your password" / "Reset your password".
 *
 * Sent through Resend rather than Supabase's own mailer: the project uses
 * Supabase's built-in SMTP, which is rate limited to a handful of messages
 * an hour and sends from a supabase.co address. These go from the company's
 * own domain, alongside every other mail the app sends.
 */
export function buildPasswordLinkEmail(opts: {
  /** A brand-new login, or a password reset for one that exists. */
  kind: "invite" | "reset";
  name: string | null;
  url: string;
  /** Who sent the invite, for the "why am I getting this" line. */
  invitedByName?: string | null;
  /** How long the link is good for, in hours. */
  expiresInHours: number;
}): { subject: string; html: string } {
  const isInvite = opts.kind === "invite";
  const name = opts.name ? escapeHtml(opts.name.split(" ")[0]) : null;
  const invitedBy = opts.invitedByName ? escapeHtml(opts.invitedByName) : null;
  const url = escapeHtml(opts.url);

  const subject = isInvite ? "Your Atlantis Utility account" : "Reset your Atlantis Utility password";

  const opening = isInvite
    ? `${invitedBy ? `${invitedBy} has set` : "We've set"} up an account for you on the Atlantis Utility app. Choose a password and you're in.`
    : "Someone asked to reset the password on your Atlantis Utility account. If that was you, choose a new one here.";

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0a0a0a;">
      <p style="font-size:15px;line-height:1.5;">${name ? `Hi ${name},` : "Hello,"}</p>
      <p style="font-size:15px;line-height:1.5;">${opening}</p>
      <p style="margin:28px 0;">
        <a href="${url}"
           style="background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block;">
          ${isInvite ? "Set your password" : "Choose a new password"}
        </a>
      </p>
      <p style="font-size:13px;line-height:1.5;color:#666;">
        This link works once and expires in ${opts.expiresInHours} hour${opts.expiresInHours === 1 ? "" : "s"}.
        ${isInvite ? "" : "If you didn't ask for this, you can ignore this email; nothing changes until the link is used."}
      </p>
      <p style="font-size:12px;line-height:1.5;color:#999;word-break:break-all;">
        If the button doesn't work, paste this into your browser:<br />${url}
      </p>
      <p style="font-size:12px;color:#bbb;margin-top:28px;">Atlantis Utility</p>
    </div>
  `;

  return { subject, html };
}
