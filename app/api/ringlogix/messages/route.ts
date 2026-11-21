import { NextRequest, NextResponse } from "next/server";
import { getMessageSessions, getSubscribers, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import {
  normalizeSession, sortConversations, dedupeConversations,
  type RawMessageSession, type SmsConversation,
} from "@/lib/ringlogix-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A domain with fifty extensions is fifty reads on a cold cache. They run
// eight at a time and each one is cached for three minutes afterwards, so
// this is slow once and instant after.
export const maxDuration = 60;

/**
 * Every text conversation on a domain.
 *
 * RingLogix keys conversations by extension, not by number: there is no
 * "all messages on this domain" call, only "this extension's sessions". So
 * the subscriber list is the index, and this fans out across it.
 *
 * Extensions with no messages - auto-attendants, voicemail boxes, the DIDs
 * that appear in the subscriber list - answer with an empty array, which
 * costs a round trip and nothing else.
 */
const CONCURRENCY = 8;

/** Runs `work` over `items`, a few at a time, keeping the failures quiet. */
async function pooled<T, R>(items: T[], work: (item: T) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        out.push(...(await work(items[i])));
      } catch {
        // One extension refusing is not a reason to show nothing: the rest
        // of the mailbox is still worth reading.
      }
    }
  });
  await Promise.all(workers);
  return out;
}

export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const domain = req.nextUrl.searchParams.get("domain")?.trim() || ourDomain();
  if (!domain) {
    return NextResponse.json({ error: "No domain to read messages for" }, { status: 400 });
  }

  try {
    const subscribers = (await getSubscribers(domain)) as Array<{ user?: string }>;
    const users = [...new Set(subscribers.map((s) => s.user).filter(Boolean) as string[])];

    const conversations = await pooled(users, async (user) => {
      const rows = ((await getMessageSessions(domain, user)) ?? []) as RawMessageSession[];
      return rows.map(normalizeSession);
    });

    // A conversation with no last message is an empty shell the PBX keeps
    // after a thread is cleared; it has nothing to show.
    const real: SmsConversation[] = conversations.filter((c) => c.sessionId && (c.lastMessage || c.hasMedia));

    return NextResponse.json({
      domain,
      extensions: users.length,
      conversations: sortConversations(dedupeConversations(real)),
    });
  } catch (err) {
    return ringlogixFailure(err);
  }
}
