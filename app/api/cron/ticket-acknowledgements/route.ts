import { NextRequest, NextResponse } from "next/server";
import { acknowledgeNewTickets, DEFAULT_LOOKBACK_MINUTES, sendTestAcknowledgement } from "@/lib/tickets/acknowledge";
import { requireAdmin, ApiAuthError } from "@/lib/api-auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sends the "we have your request" reply to tickets that have just come in.
 *
 * Scheduled, because a ticket is an email arriving in a shared mailbox and
 * nothing tells the app when that happens. The schedule is what decides how
 * fast a customer hears back, and the lookback window has to cover the gap
 * between runs or a ticket falls through it — see vercel.json.
 *
 * Re-running is harmless: a thread anyone here has sent into is skipped, and
 * our own acknowledgement counts (lib/tickets/acknowledge.ts).
 */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — allow (dev/local)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.MS_TICKETS_CLIENT_ID || !process.env.MS_TICKETS_CLIENT_SECRET || !process.env.MS_TICKETS_TENANT_ID) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  // A dry run names every thread it would have replied to, and every one it
  // wouldn't, with the reason. Worth doing after any change to the window.
  const dryRun = searchParams.get("dryRun") === "1";
  const lookbackMinutes = Number(searchParams.get("lookback")) || DEFAULT_LOOKBACK_MINUTES;

  try {
    const result = await acknowledgeNewTickets({ dryRun, lookbackMinutes });
    return NextResponse.json({
      ok: true,
      sent: result.acknowledged.length,
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[ticket-ack]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Send one to yourself, to read what a customer reads.
 *
 * Admin-only and employees only: this sends mail from the support mailbox,
 * so it is not something to leave pointing at any address anyone likes.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as { to?: string; name?: string };
    const to = (body.to ?? "").trim().toLowerCase();
    if (!to) return NextResponse.json({ error: "No address given" }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data: employee } = await supabase
      .from("employees")
      .select("id")
      .ilike("email", to)
      .maybeSingle();
    if (!employee) {
      return NextResponse.json(
        { error: "Test sends only go to an employee address, so this can't be aimed at a customer." },
        { status: 400 },
      );
    }

    await sendTestAcknowledgement(to, body.name);
    return NextResponse.json({ ok: true, to });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[ticket-ack:test]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
