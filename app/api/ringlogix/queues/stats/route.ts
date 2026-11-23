import { NextRequest, NextResponse } from "next/server";
import { getQueueStats, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { denyUnlessEmployee } from "@/lib/ringlogix-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live queue figures: who is waiting, how long, and how many agents are free.
 *
 * Deliberately uncached - these are gauges read at the moment of asking,
 * and a three-minute-old "4 callers waiting" is worse than no number. The
 * field names arrive as `gau_*`, which is what the PBX calls a gauge.
 */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessEmployee();
  if (denied) return denied;

  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const domain = req.nextUrl.searchParams.get("domain")?.trim() || ourDomain();

  try {
    const rows = ((await getQueueStats(domain)) ?? []) as Array<Record<string, string>>;
    return NextResponse.json({
      domain,
      asOf: rows[0]?.timestamp ?? "",
      queues: rows.map((r) => ({
        queue: r.user ?? "",
        waiting: Number(r.gau_queue_length ?? 0) || 0,
        longestWaitSec: Number(r.gau_queue_max_wait ?? 0) || 0,
        averageWaitSec: Number(r.gau_queue_avg_wait ?? 0) || 0,
        agentsTotal: Number(r.gau_agent_total ?? 0) || 0,
        // The PBX capitalises this one and not the others; read as given
        // rather than tidied, because a rename upstream should fail loudly.
        agentsAvailable: Number(r.gau_agent_available ?? 0) || 0,
        agentsUnavailable: Number(r.gau_agent_Unavailable ?? 0) || 0,
        activeCalls: Number(r.gau_session ?? 0) || 0,
      })),
    });
  } catch (err) {
    return ringlogixFailure(err);
  }
}
