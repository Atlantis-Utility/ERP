import { NextResponse } from "next/server";
import { getGraphToken, TICKET_MAILBOX_ENCODED } from "./_ms-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GraphMessage {
  id: string;
  conversationId: string;
  subject?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  receivedDateTime?: string;
  bodyPreview?: string;
  isRead?: boolean;
}

export interface EmailTicket {
  id: string; threadId: string; from: string; fromName: string;
  subject: string; snippet: string; receivedAt: string; isUnread: boolean;
  /** How many emails are in the thread. 1 for a one-off. */
  messageCount: number;
  /** When it started, as against receivedAt, which is the latest reply. */
  startedAt: string;
}

const NOREPLY_PATTERN = /noreply|no-reply|donotreply|mailer-daemon|postmaster/i;

/**
 * The thread's name, without the reply chain. The oldest message we hold is
 * not always the one that started it - a thread running since March is
 * older than the window - so its subject can itself be a "RE:", and a list
 * of "RE: RE: FW:" tells nobody anything. The colon is required, so
 * "Re-cabling quote" keeps its name.
 */
const threadSubject = (subject: string | undefined): string =>
  (subject ?? "").replace(/^((re|fw|fwd)\s*:\s*)+/i, "").trim();

/**
 * One thread, one ticket.
 *
 * Graph lists messages, not conversations, so this groups them - and it has
 * to see the whole window at once. Grouping a single page of 100 messages
 * split a long thread in half: "Help with Thousand Oaks phones" runs to 18
 * emails and straddles two pages, so page three held part of it and page
 * four held the rest, each pretending to be a separate ticket.
 *
 * What the row shows is the thread as a whole: the subject it started with,
 * because that is what the request was, and the time, sender and preview of
 * the newest message, because that is what has happened since. A thread
 * someone replied to this morning belongs at the top of the list, not back
 * where it was opened in March.
 */
function messagesToTickets(messages: GraphMessage[]): EmailTicket[] {
  const groups = new Map<string, GraphMessage[]>();
  for (const m of messages) {
    if (NOREPLY_PATTERN.test(m.from?.emailAddress?.address ?? "")) continue;
    const g = groups.get(m.conversationId) ?? [];
    g.push(m);
    groups.set(m.conversationId, g);
  }

  const tickets: EmailTicket[] = [];
  for (const [conversationId, msgs] of groups) {
    const byDate = [...msgs].sort((a, b) =>
      (a.receivedDateTime ?? "").localeCompare(b.receivedDateTime ?? ""),
    );
    const first = byDate[0];
    const latest = byDate[byDate.length - 1];
    tickets.push({
      id:           conversationId,
      threadId:     conversationId,
      from:         latest.from?.emailAddress?.address ?? "",
      fromName:     latest.from?.emailAddress?.name ?? latest.from?.emailAddress?.address ?? "",
      // The original subject, not "Re: Re: Fwd:" from whichever reply came last.
      subject:      threadSubject(first.subject) || threadSubject(latest.subject) || "(no subject)",
      snippet:      latest.bodyPreview ?? "",
      receivedAt:   latest.receivedDateTime ?? new Date().toISOString(),
      startedAt:    first.receivedDateTime ?? new Date().toISOString(),
      messageCount: msgs.length,
      isUnread:     msgs.some((m) => m.isRead === false),
    });
  }
  return tickets.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

const CACHE_TTL = 60_000;

/**
 * How far back the list reaches. Six hundred messages covers the mailbox
 * several times over as it stands, and the ceiling is what stops a very
 * large inbox turning one page view into fifty Graph calls.
 */
const MAX_GRAPH_PAGES = 6;
/** Threads per page of the list, now that a page means threads. */
const THREADS_PER_PAGE = 50;

interface CachedThreads {
  tickets: EmailTicket[];
  expiresAt: number;
}
let threadCache: CachedThreads | null = null;

function pageOf(all: EmailTicket[], offset: number) {
  const next = offset + THREADS_PER_PAGE;
  return {
    tickets: all.slice(offset, next),
    nextPageToken: next < all.length ? String(next) : null,
    total: all.length,
  };
}

export async function GET(req: Request) {
  if (!process.env.MS_TICKETS_CLIENT_ID || !process.env.MS_TICKETS_CLIENT_SECRET || !process.env.MS_TICKETS_TENANT_ID) {
    return NextResponse.json({ error: "not_configured", tickets: [] });
  }
  try {
    const token = await getGraphToken();
    const { searchParams } = new URL(req.url);
    const pageToken = searchParams.get("pageToken") ?? undefined;
    const offset = Number(pageToken ?? 0) || 0;

    // Cached as the whole grouped list, not per page: the grouping needs
    // every message to be right, so slicing a cached list beats fetching
    // six pages of Graph again to answer "the next fifty".
    const hit = threadCache;
    if (hit && hit.expiresAt > Date.now()) {
      return NextResponse.json(pageOf(hit.tickets, offset), { headers: { "X-Cache": "HIT" } });
    }

    // Several pages of messages, grouped together, so a thread is never cut
    // in half by a page boundary. The mailbox runs to a few hundred
    // messages and the response is cached, so this is a handful of Graph
    // calls a minute rather than per request.
    //
    // pageToken is where in the *grouped* list to carry on from: paging by
    // message meant a page could hold 34 threads or 90, depending on how
    // chatty they happened to be.
    const messages: GraphMessage[] = [];
    let url: string | undefined = (() => {
      const u = new URL(`https://graph.microsoft.com/v1.0/users/${TICKET_MAILBOX_ENCODED}/mailFolders/inbox/messages`);
      u.searchParams.set("$top", "100");
      u.searchParams.set("$orderby", "receivedDateTime desc");
      u.searchParams.set("$select", "id,conversationId,subject,from,receivedDateTime,bodyPreview,isRead");
      return u.toString();
    })();

    for (let page = 0; page < MAX_GRAPH_PAGES && url; page++) {
      const listRes: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!listRes.ok) {
        // A later page failing is not worth losing the earlier ones over.
        if (messages.length === 0) {
          return NextResponse.json({ error: await listRes.text(), tickets: [] }, { status: 502 });
        }
        break;
      }
      const data = (await listRes.json()) as { value?: GraphMessage[]; "@odata.nextLink"?: string };
      messages.push(...(data.value ?? []));
      url = data["@odata.nextLink"];
    }

    const all = messagesToTickets(messages);
    threadCache = { tickets: all, expiresAt: Date.now() + CACHE_TTL };
    return NextResponse.json(pageOf(all, offset), { headers: { "X-Cache": "MISS" } });
  } catch (err) {
    return NextResponse.json({ error: String(err), tickets: [] }, { status: 500 });
  }
}
