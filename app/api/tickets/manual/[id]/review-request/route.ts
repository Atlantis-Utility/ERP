import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { findReviewByTicketId, createReviewRequest } from "@/lib/db/ticket-reviews";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { buildTicketReviewEmail } from "@/lib/email/ticket-review-email";

// Called by the tickets page right after a manual ticket's status is saved
// as "closed". Sends at most one review-request email per ticket, ever —
// safe to call again if the ticket is reopened and re-closed.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceRoleClient();

  const { data: ticket, error } = await supabase
    .from("manual_tickets")
    .select("id, subject, customer_name, customer_email")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!ticket.customer_email) {
    console.error(`[review-request] ticket ${id}: no customer_email on file`);
    return NextResponse.json({ ok: true, reviewSent: false, reason: "no_customer_email" });
  }
  if (!isEmailConfigured()) {
    console.error(`[review-request] ticket ${id}: RESEND_API_KEY/RESEND_FROM_EMAIL not set in this environment`);
    return NextResponse.json({ ok: true, reviewSent: false, reason: "email_not_configured" });
  }

  const existing = await findReviewByTicketId(supabase, id);
  if (existing) {
    console.error(`[review-request] ticket ${id}: already sent, skipping (token ${existing.token})`);
    return NextResponse.json({ ok: true, reviewSent: false, reason: "already_sent" });
  }

  const token = randomUUID();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const { subject, html } = buildTicketReviewEmail({
    customerName: ticket.customer_name ?? "there",
    subject: ticket.subject ?? "your request",
    token,
    appUrl,
  });

  await createReviewRequest(supabase, {
    token,
    ticketId: id,
    customerName: ticket.customer_name ?? "",
    customerEmail: ticket.customer_email,
    subject: ticket.subject ?? "",
  });

  try {
    await sendEmail({ to: ticket.customer_email, subject, html });
  } catch (err) {
    // Roll back so a retry (e.g. reopening and re-closing the ticket) isn't
    // permanently blocked by findReviewByTicketId's "already sent" check.
    await supabase.from("ticket_reviews").delete().eq("token", token);
    const msg = err instanceof Error ? err.message : "send_failed";
    console.error(`[review-request] ticket ${id}: send failed — ${msg}`);
    return NextResponse.json({ ok: true, reviewSent: false, reason: msg });
  }

  console.log(`[review-request] ticket ${id}: sent to ${ticket.customer_email} (token ${token})`);
  return NextResponse.json({ ok: true, reviewSent: true });
}
