import { escapeHtml } from "./escape-html";

/**
 * The customer-facing bulletin: outages, maintenance, news, offers.
 *
 * One shell for all of them, so an outage notice and a price change arrive
 * looking like the same company wrote them. What changes between kinds is a
 * single accent colour and the label above the headline - a customer
 * skimming their inbox at 7am should be able to tell "your internet is down"
 * from "we have an offer" without reading a word of the body.
 *
 * Built from plain text the sender types, never raw HTML: everything here is
 * escaped. A broadcast goes to hundreds of people at once and nobody is
 * reviewing the markup on the way out.
 *
 * Rendered on the client for the preview and on the server for the send,
 * from this one function, so what was approved is what goes.
 */

export type BroadcastKind = "outage" | "maintenance" | "restored" | "news" | "promotion" | "custom";

interface KindStyle {
  /** The label above the headline. Empty for a plain message. */
  eyebrow: string;
  accent: string;
}

const KIND: Record<BroadcastKind, KindStyle> = {
  outage:      { eyebrow: "Service disruption",  accent: "#d93025" },
  maintenance: { eyebrow: "Planned maintenance", accent: "#b26b00" },
  restored:    { eyebrow: "Service restored",    accent: "#17803d" },
  news:        { eyebrow: "Service update",      accent: "#0070f3" },
  promotion:   { eyebrow: "",                    accent: "#0a0a0a" },
  custom:      { eyebrow: "",                    accent: "#0a0a0a" },
};

export interface BroadcastDetail {
  label: string;
  value: string;
}

export interface BroadcastContent {
  kind: BroadcastKind;
  headline: string;
  /** Plain text. A blank line starts a new paragraph. */
  body: string;
  /** The facts a customer wants at a glance: area, window, expected back. */
  details: BroadcastDetail[];
  cta?: { label: string; url: string } | null;
}

/** Who it's from, in the footer. Not configurable - it's us. */
const SUPPORT_EMAIL = "ticket@atlantisutility.com";
const SUPPORT_PHONE = "(805) 500-8080";

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 14px;">${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
}

export function buildBroadcastEmail(
  content: BroadcastContent,
  opts: { customerName?: string | null } = {},
): { html: string } {
  const style = KIND[content.kind] ?? KIND.custom;
  const name = opts.customerName?.trim();
  // A company name in the greeting, not a person's: the address on file is
  // the account's, and "Dear Accounts Payable" is worse than "Hello".
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hello,";

  const details = content.details.filter((d) => d.label.trim() && d.value.trim());

  const html = `
    <div style="background:#f5f5f5;padding:24px 12px;">
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eaeaea;">
        <div style="height:4px;background:${style.accent};"></div>
        <div style="padding:28px 28px 8px;">
          <p style="margin:0 0 20px;font-size:15px;font-weight:700;letter-spacing:-.01em;color:#0a0a0a;">Atlantis Utility</p>
          ${
            style.eyebrow
              ? `<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${style.accent};">${escapeHtml(style.eyebrow)}</p>`
              : ""
          }
          ${
            content.headline.trim()
              ? `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:650;color:#0a0a0a;">${escapeHtml(content.headline.trim())}</h1>`
              : ""
          }
          <div style="font-size:15px;line-height:1.6;color:#333;">
            <p style="margin:0 0 14px;">${greeting}</p>
            ${paragraphs(content.body)}
          </div>
          ${
            details.length
              ? `<table style="width:100%;border-collapse:collapse;margin:4px 0 18px;font-size:14px;line-height:1.5;">
                   ${details
                     .map(
                       (d) => `<tr>
                         <td style="padding:7px 14px 7px 0;color:#888;white-space:nowrap;vertical-align:top;border-top:1px solid #f0f0f0;">${escapeHtml(d.label.trim())}</td>
                         <td style="padding:7px 0;color:#0a0a0a;font-weight:600;border-top:1px solid #f0f0f0;">${escapeHtml(d.value.trim())}</td>
                       </tr>`,
                     )
                     .join("")}
                 </table>`
              : ""
          }
          ${
            content.cta?.label.trim() && content.cta.url.trim()
              ? `<p style="margin:22px 0 8px;">
                   <a href="${escapeHtml(content.cta.url.trim())}" style="background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px;display:inline-block;">${escapeHtml(content.cta.label.trim())}</a>
                 </p>`
              : ""
          }
        </div>
        <div style="padding:18px 28px 24px;border-top:1px solid #f0f0f0;margin-top:14px;">
          <p style="margin:0 0 4px;font-size:13px;line-height:1.6;color:#666;">
            Questions? Reply to this email or call ${escapeHtml(SUPPORT_PHONE)} and we'll pick it up.
          </p>
          <p style="margin:0;font-size:11px;line-height:1.6;color:#aaa;">
            Sent by Atlantis Utility to customers on this service. Support: ${escapeHtml(SUPPORT_EMAIL)}
          </p>
        </div>
      </div>
    </div>
  `;

  return { html };
}
