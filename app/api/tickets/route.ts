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
}

const NOREPLY_PATTERN = /noreply|no-reply|donotreply|mailer-daemon|postmaster/i;

// Graph lists individual messages rather than threads — group by conversationId
// to emulate the ticket-per-thread view.
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
    const first = msgs.reduce((a, b) =>
      (a.receivedDateTime ?? "") <= (b.receivedDateTime ?? "") ? a : b
    );
    const isUnread = msgs.some((m) => m.isRead === false);
    tickets.push({
      id:         conversationId,
      threadId:   conversationId,
      from:       first.from?.emailAddress?.address ?? "",
      fromName:   first.from?.emailAddress?.name ?? first.from?.emailAddress?.address ?? "",
      subject:    first.subject || "(no subject)",
      snippet:    first.bodyPreview ?? "",
      receivedAt: first.receivedDateTime ?? new Date().toISOString(),
      isUnread,
    });
  }
  return tickets.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

const CACHE_TTL = 60_000;

interface CachedResponse {
  data: { tickets: EmailTicket[]; nextPageToken: string | null; total: number };
  expiresAt: number;
}
const responseCache = new Map<string, CachedResponse>();

export async function GET(req: Request) {
  if (!process.env.MS_TICKETS_CLIENT_ID || !process.env.MS_TICKETS_CLIENT_SECRET || !process.env.MS_TICKETS_TENANT_ID) {
    return NextResponse.json({ error: "not_configured", tickets: [] });
  }
  try {
    const token = await getGraphToken();
    const { searchParams } = new URL(req.url);
    const pageToken = searchParams.get("pageToken") ?? undefined;
    const cacheKey  = pageToken ?? "__first__";

    const hit = responseCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return NextResponse.json(hit.data, { headers: { "X-Cache": "HIT" } });
    }

    // pageToken, when present, is the opaque @odata.nextLink from the previous page
    let url: string;
    if (pageToken) {
      url = pageToken;
    } else {
      const u = new URL(`https://graph.microsoft.com/v1.0/users/${TICKET_MAILBOX_ENCODED}/mailFolders/inbox/messages`);
      u.searchParams.set("$top", "100");
      u.searchParams.set("$orderby", "receivedDateTime desc");
      u.searchParams.set("$select", "id,conversationId,subject,from,receivedDateTime,bodyPreview,isRead");
      url = u.toString();
    }

    const listRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!listRes.ok) return NextResponse.json({ error: await listRes.text(), tickets: [] }, { status: 502 });

    const data = await listRes.json() as {
      value?: GraphMessage[];
      "@odata.nextLink"?: string;
    };

    const tickets = messagesToTickets(data.value ?? []);

    const result = {
      tickets,
      nextPageToken: data["@odata.nextLink"] ?? null,
      total: tickets.length,
    };
    responseCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL });
    return NextResponse.json(result, { headers: { "X-Cache": "MISS" } });
  } catch (err) {
    return NextResponse.json({ error: String(err), tickets: [] }, { status: 500 });
  }
}
