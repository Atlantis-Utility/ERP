import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { findReviewByTicketId, createReviewRequest } from "@/lib/db/ticket-reviews";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { buildTicketReviewEmail } from "@/lib/email/ticket-review-email";

export type ReviewRequestResult = { sent: true } | { sent: false; reason: string };

// Shared by both the manual-ticket and email-ticket review-request routes.
// One review request per ticket id, ever — findReviewByTicketId dedupes so
// re-closing a reopened ticket is a safe no-op instead of a re-send.
export async function sendReviewRequestOnce(
  supabase: SupabaseClient,
  opts: { ticketId: string; customerName: string; customerEmail: string | null | undefined; subject: string },
): Promise<ReviewRequestResult> {
  const { ticketId, customerName, customerEmail, subject } = opts;

  if (!customerEmail) {
    console.error(`[review-request] ticket ${ticketId}: no customer email on file`);
    return { sent: false, reason: "no_customer_email" };
  }
  if (!isEmailConfigured()) {
    console.error(`[review-request] ticket ${ticketId}: RESEND_API_KEY/RESEND_FROM_EMAIL not set in this environment`);
    return { sent: false, reason: "email_not_configured" };
  }

  const existing = await findReviewByTicketId(supabase, ticketId);
  if (existing) {
    console.error(`[review-request] ticket ${ticketId}: already sent, skipping (token ${existing.token})`);
    return { sent: false, reason: "already_sent" };
  }

  const token = randomUUID();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const { subject: emailSubject, html } = buildTicketReviewEmail({
    customerName: customerName || "there",
    subject: subject || "your request",
    token,
    appUrl,
  });

  await createReviewRequest(supabase, { token, ticketId, customerName, customerEmail, subject });

  try {
    await sendEmail({ to: customerEmail, subject: emailSubject, html });
  } catch (err) {
    // Roll back so a retry isn't permanently blocked by the "already sent" check.
    await supabase.from("ticket_reviews").delete().eq("token", token);
    const msg = err instanceof Error ? err.message : "send_failed";
    console.error(`[review-request] ticket ${ticketId}: send failed — ${msg}`);
    return { sent: false, reason: msg };
  }

  console.log(`[review-request] ticket ${ticketId}: sent to ${customerEmail} (token ${token})`);
  return { sent: true };
}
