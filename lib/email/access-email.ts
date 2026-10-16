import { escapeHtml } from "./escape-html";

/** The kinds of thing one person can hand to another. */
export type SharedKind = "note" | "campaign" | "lead" | "vault";

const WHAT: Record<SharedKind, { noun: string; verb: string }> = {
  note: { noun: "note", verb: "shared a note with you" },
  campaign: { noun: "call sheet", verb: "given you access to a call sheet" },
  lead: { noun: "lead", verb: "given you access to some leads" },
  vault: { noun: "vault entry", verb: "shared a vault entry with you" },
};

/**
 * "X shared Y with you", and a link straight to it.
 *
 * Sharing something in the app is silent otherwise: the person it was
 * handed to finds out when they next happen to look, which for a call sheet
 * they are expected to work is too late to be useful.
 *
 * It deliberately carries no detail beyond the name - a vault entry's
 * subject matter has no business sitting in an inbox. The link is where the
 * content is, behind the sign-in that governs it.
 */
export function buildAccessEmail(opts: {
  kind: SharedKind;
  /** What it's called: the note's title, the campaign's name. */
  name: string;
  /** First name is enough; the mail is to a colleague. */
  toName?: string | null;
  fromName?: string | null;
  /** "can edit" / "read-only", when the share has levels. */
  level?: string | null;
  url: string;
}): { subject: string; html: string } {
  const what = WHAT[opts.kind];
  const name = escapeHtml(opts.name || `a ${what.noun}`);
  const to = opts.toName ? escapeHtml(opts.toName.split(" ")[0]) : null;
  const from = opts.fromName ? escapeHtml(opts.fromName) : "Someone";
  const url = escapeHtml(opts.url);
  const level = opts.level ? escapeHtml(opts.level) : null;

  const subject = `${from} shared ${opts.name || `a ${what.noun}`} with you`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0a0a0a;">
      <p style="font-size:15px;line-height:1.5;">${to ? `Hi ${to},` : "Hello,"}</p>
      <p style="font-size:15px;line-height:1.5;">
        ${from} has ${what.verb} on the Atlantis Utility app:
        <strong>${name}</strong>${level ? ` <span style="color:#666;">(${level})</span>` : ""}.
      </p>
      <p style="margin:28px 0;">
        <a href="${url}"
           style="background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block;">
          Open the ${what.noun}
        </a>
      </p>
      <p style="font-size:13px;line-height:1.5;color:#666;">
        You'll need to be signed in. If the link doesn't open, copy this into your browser:<br>
        <span style="color:#0070f3;word-break:break-all;">${url}</span>
      </p>
      <p style="font-size:12px;line-height:1.5;color:#999;margin-top:28px;">
        Sent by the Atlantis Utility app because something was shared with you.
      </p>
    </div>
  `;

  return { subject, html };
}
