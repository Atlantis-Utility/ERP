import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendReviewRequestOnce } from "@/lib/email/send-review-request";

// Called by the tickets page right after an email-sourced ticket's status is
// saved as "closed". Unlike the manual-ticket route, these tickets live in
// the mailbox (via Microsoft Graph), not a Supabase table, so the caller
// passes the customer's name/email/subject straight from what it already
// has loaded rather than us looking it up server-side.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const customerEmail = typeof body.customerEmail === "string" ? body.customerEmail : undefined;
  const customerName = typeof body.customerName === "string" ? body.customerName : "";
  const subject = typeof body.subject === "string" ? body.subject : "";

  const supabase = createServiceRoleClient();
  const result = await sendReviewRequestOnce(supabase, { ticketId: id, customerName, customerEmail, subject });

  return NextResponse.json(
    result.sent ? { ok: true, reviewSent: true } : { ok: true, reviewSent: false, reason: result.reason }
  );
}
