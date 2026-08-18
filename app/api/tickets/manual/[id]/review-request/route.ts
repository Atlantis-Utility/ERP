import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendReviewRequestOnce } from "@/lib/email/send-review-request";

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

  const result = await sendReviewRequestOnce(supabase, {
    ticketId: id,
    customerName: ticket.customer_name ?? "",
    customerEmail: ticket.customer_email,
    subject: ticket.subject ?? "",
  });

  return NextResponse.json(
    result.sent ? { ok: true, reviewSent: true } : { ok: true, reviewSent: false, reason: result.reason }
  );
}
