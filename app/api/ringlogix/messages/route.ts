import { NextRequest, NextResponse } from "next/server";
import { getContacts, getMessageSessions, getSubscribers, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import {
  normalizeSession, sortConversations, dedupeConversations, namesByExtension,
  type RawMessageSession, type SmsConversation,
} from "@/lib/ringlogix-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Every text conversation on a domain.
 *
 * RingLogix keys conversations by extension and refuses a read without a
 * `user`. It does, however, accept `user=*`, which returns the domain's
 * whole mailbox in one call - verified against the alternative below, which
 * walks the subscriber list and returns exactly the same 154 sessions for
 * 54 times the requests.
 *
 * The walk is kept as a fallback rather than deleted: the wildcard is not
 * in any documentation we hold, so if a future release stops honouring it
 * this degrades to slow instead of empty.
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

/** The slow way: one read per extension, eight at a time. */
async function everyExtension(domain: string): Promise<RawMessageSession[]> {
  const subscribers = (await getSubscribers(domain)) as Array<{ user?: string }>;
  const users = [...new Set(subscribers.map((s) => s.user).filter(Boolean) as string[])];
  return pooled(users, async (user) =>
    ((await getMessageSessions(domain, user)) ?? []) as RawMessageSession[],
  );
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
    let rows: RawMessageSession[];
    let via: "wildcard" | "per-extension" = "wildcard";
    try {
      rows = ((await getMessageSessions(domain, "*")) ?? []) as RawMessageSession[];
    } catch {
      via = "per-extension";
      rows = await everyExtension(domain);
    }

    // A conversation with no last message is an empty shell the PBX keeps
    // after a thread is cleared; it has nothing to show.
    const real: SmsConversation[] = rows
      .map(normalizeSession)
      .filter((c) => c.sessionId && (c.lastMessage || c.hasMedia));

    const conversations = sortConversations(dedupeConversations(real));
    // Colleagues text each other too, and those conversations carry an
    // extension where a customer's would carry a phone number. Sent along
    // so the list can say "Cyril Obishai" rather than "104".
    const subscribers = (await getSubscribers(domain).catch(() => [])) as Array<Record<string, string>>;

    // The contact book, so a number somebody has named reads as that name
    // rather than as digits. Contacts are per-extension with a shared
    // flag, so this asks the extensions that actually hold conversations
    // plus "*" for the shared ones - six calls, each cached.
    const owners = [...new Set(conversations.map((c) => c.user).filter(Boolean))];
    const books = await Promise.all(
      ["*", ...owners].map((u) =>
        (getContacts(domain, u) as Promise<Array<Record<string, string>>>).catch(() => []),
      ),
    );
    const contacts: Record<string, { name: string; company: string }> = {};
    for (const book of books) {
      for (const entry of book ?? []) {
        const name = `${entry.first_name ?? ""} ${entry.last_name ?? ""}`.replace(/\s+/g, " ").trim();
        if (!name) continue;
        for (const field of ["cell_phone", "work_phone", "home_phone"]) {
          const digits = (entry[field] ?? "").replace(/\D/g, "").slice(-10);
          // Last ten digits, so "805-816-8896" and "18058168896" are one
          // number rather than two.
          if (digits.length === 10 && !contacts[digits]) {
            contacts[digits] = { name, company: (entry.company ?? "").trim() };
          }
        }
      }
    }

    // Which of our numbers can send, and from which extension. Derived
    // from the mailbox rather than hardcoded, so a number added or taken
    // away in RingLogix is reflected here without a code change.
    const senders: Array<{ number: string; user: string }> = [];
    for (const c of conversations) {
      if (!c.ourNumber || !c.user) continue;
      if (senders.some((x) => x.number === c.ourNumber)) continue;
      senders.push({ number: c.ourNumber, user: c.user });
    }

    return NextResponse.json({
      domain,
      via,
      senders,
      conversations,
      names: namesByExtension(subscribers ?? []),
      contacts,
      unread: conversations.filter((c) => c.unread).length,
    });
  } catch (err) {
    return ringlogixFailure(err);
  }
}
