import { NextResponse } from "next/server";
import { getGmailToken, GMAIL_ENCODED } from "./_gmail-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GmailThread  { id: string; snippet: string }
interface GmailMsgMeta {
  id: string; threadId: string; snippet: string; labelIds?: string[]; internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
}

export interface EmailTicket {
  id: string; threadId: string; from: string; fromName: string;
  subject: string; snippet: string; receivedAt: string; isUnread: boolean;
}

function parseFrom(raw: string): { from: string; fromName: string } {
  const m = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (m) return { fromName: m[1].trim().replace(/^"|"$/g, ""), from: m[2].trim() };
  return { from: raw.trim(), fromName: raw.trim() };
}

function threadToTicket(thread: { id: string; messages?: GmailMsgMeta[] }): EmailTicket | null {
  const messages = thread.messages ?? [];
  if (messages.length === 0) return null;
  const first    = messages[0];
  const isUnread = messages.some((m) => (m.labelIds ?? []).includes("UNREAD"));
  const hdr      = first.payload?.headers ?? [];
  const get      = (n: string) => hdr.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
  const { from, fromName } = parseFrom(get("From"));
  return {
    id: thread.id, threadId: thread.id,
    from, fromName,
    subject:    get("Subject") || "(no subject)",
    snippet:    first.snippet ?? "",
    receivedAt: first.internalDate
      ? new Date(parseInt(first.internalDate)).toISOString()
      : new Date(get("Date")).toISOString(),
    isUnread,
  };
}

// Gmail Batch API — send up to 100 thread-detail requests in a single HTTP call.
// Replaces the old sequential-batches-of-10 pattern (10 round-trips → 1 round-trip).
async function batchFetchThreads(threadIds: string[], token: string): Promise<EmailTicket[]> {
  if (threadIds.length === 0) return [];

  const boundary = `gtbatch_${Date.now()}`;
  const threadPath = (id: string) =>
    `/gmail/v1/users/${GMAIL_ENCODED}/threads/${id}?format=metadata` +
    `&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;

  const bodyParts = threadIds.map((id, i) =>
    `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <${i}>\r\n\r\nGET ${threadPath(id)}\r\n`
  );
  const body = bodyParts.join("\r\n") + `\r\n--${boundary}--`;

  const res = await fetch("https://www.googleapis.com/batch/gmail/v1", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/mixed; boundary=${boundary}`,
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    // Fallback: fetch all in parallel individually (still faster than sequential batches)
    const results = await Promise.all(threadIds.map(async (id) => {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/${GMAIL_ENCODED}/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      if (!r.ok) return null;
      return threadToTicket(await r.json() as { id: string; messages?: GmailMsgMeta[] });
    }));
    return results.filter((t): t is EmailTicket => t !== null);
  }

  const text = await res.text();

  // Extract the response boundary (different from the request boundary)
  const ct = res.headers.get("content-type") ?? "";
  const resBoundary = ct.match(/boundary=([^\s;,"]+)/)?.[1]?.replace(/^"|"$/g, "");
  if (!resBoundary) return [];

  const tickets: EmailTicket[] = [];
  const parts = text.split(`--${resBoundary}`).slice(1); // remove preamble

  for (const part of parts) {
    if (part.trimStart().startsWith("--")) break; // epilogue boundary

    // Each part: HTTP meta headers → blank line → HTTP status line → blank line → JSON body
    const jsonStart = part.indexOf("{");
    const jsonEnd   = part.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) continue;

    try {
      const thread = JSON.parse(part.slice(jsonStart, jsonEnd + 1)) as { id: string; messages?: GmailMsgMeta[] };
      const ticket = threadToTicket(thread);
      if (ticket) tickets.push(ticket);
    } catch { /* skip malformed part */ }
  }

  return tickets;
}

const PAGE_SIZE = 100;
const CACHE_TTL = 60_000;

interface CachedResponse {
  data: { tickets: EmailTicket[]; nextPageToken: string | null; total: number };
  expiresAt: number;
}
const responseCache = new Map<string, CachedResponse>();

export async function GET(req: Request) {
  if (!process.env.GMAIL_CLIENT_EMAIL || !process.env.GMAIL_PRIVATE_KEY) {
    return NextResponse.json({ error: "not_configured", tickets: [] });
  }
  try {
    const token = await getGmailToken();
    const { searchParams } = new URL(req.url);
    const pageToken = searchParams.get("pageToken") ?? undefined;
    const cacheKey  = pageToken ?? "__first__";

    const hit = responseCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return NextResponse.json(hit.data, { headers: { "X-Cache": "HIT" } });
    }

    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/${GMAIL_ENCODED}/threads`);
    url.searchParams.set("maxResults", String(PAGE_SIZE));
    url.searchParams.set("q", [
      "to:ticket@atlantisutility.com",
      "-from:noreply", "-from:no-reply",
      "-from:donotreply", "-from:mailer-daemon", "-from:postmaster",
    ].join(" "));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const listRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!listRes.ok) return NextResponse.json({ error: await listRes.text(), tickets: [] }, { status: 502 });

    const data = await listRes.json() as {
      threads?: GmailThread[];
      nextPageToken?: string;
      resultSizeEstimate?: number;
    };
    const threads = data.threads ?? [];

    // Single batch call instead of 10 sequential round-trips
    const tickets = await batchFetchThreads(threads.map((t) => t.id), token);

    const result = {
      tickets,
      nextPageToken: data.nextPageToken ?? null,
      total: data.resultSizeEstimate ?? tickets.length,
    };
    responseCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL });
    return NextResponse.json(result, { headers: { "X-Cache": "MISS" } });
  } catch (err) {
    return NextResponse.json({ error: String(err), tickets: [] }, { status: 500 });
  }
}
