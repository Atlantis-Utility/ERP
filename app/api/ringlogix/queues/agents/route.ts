import { NextRequest, NextResponse } from "next/server";
import { getQueueAgents, getQueues, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { denyUnlessEmployee } from "@/lib/ringlogix-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Who answers a queue.
 *
 * `agent/read` refuses without a queue name, so with no `queue` given this
 * reads the domain's queues first and asks about each - which is what any
 * caller actually wants, since a queue without its agents is a row with a
 * number on it.
 *
 * Note the API's own inconsistency, preserved in lib/ringlogix.ts: the
 * read action takes `queue_name` while count takes `queue`.
 */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessEmployee();
  if (denied) return denied;

  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const domain = searchParams.get("domain")?.trim() || ourDomain();
  const queue = searchParams.get("queue")?.trim() ?? "";

  try {
    if (queue) {
      const agents = ((await getQueueAgents(domain, queue)) ?? []) as Array<Record<string, unknown>>;
      return NextResponse.json({ domain, queues: [{ queue, agents }] });
    }

    const queues = ((await getQueues(domain)) ?? []) as Array<Record<string, unknown>>;
    const names = queues.map((q) => String(q.queue_name ?? "")).filter(Boolean);

    // Sequential rather than parallel: a domain has a handful of queues, and
    // these are cached for three minutes each, so there is nothing to win
    // by hammering the PBX with them at once.
    const out: Array<{ queue: string; description: string; agents: unknown[] }> = [];
    for (const name of names) {
      const row = queues.find((q) => String(q.queue_name) === name);
      try {
        const agents = ((await getQueueAgents(domain, name)) ?? []) as unknown[];
        out.push({ queue: name, description: String(row?.description ?? ""), agents });
      } catch {
        // One queue refusing should not empty the whole list.
        out.push({ queue: name, description: String(row?.description ?? ""), agents: [] });
      }
    }

    return NextResponse.json({ domain, queues: out });
  } catch (err) {
    return ringlogixFailure(err);
  }
}
