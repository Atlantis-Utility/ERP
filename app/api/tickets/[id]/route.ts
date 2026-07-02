import { NextResponse } from "next/server";
import { getGmailToken, GMAIL_ENCODED } from "../_gmail-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GmailPart {
  mimeType: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

interface GmailFullMsg {
  id: string;
  threadId: string;
  snippet: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPart;
}

function extractBody(part: GmailPart): { html: string | null; text: string | null } {
  if (part.mimeType === "text/html" && part.body?.data) {
    return { html: Buffer.from(part.body.data, "base64url").toString("utf-8"), text: null };
  }
  if (part.mimeType === "text/plain" && part.body?.data) {
    return { html: null, text: Buffer.from(part.body.data, "base64url").toString("utf-8") };
  }
  if (part.parts) {
    let html: string | null = null;
    let text: string | null = null;
    for (const p of part.parts) {
      const r = extractBody(p);
      if (r.html) html = r.html;
      if (r.text && !text) text = r.text;
    }
    return { html, text };
  }
  return { html: null, text: null };
}

function getHeader(part: GmailPart, name: string): string {
  return part.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseFrom(raw: string): { from: string; fromName: string } {
  const m = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (m) return { fromName: m[1].trim().replace(/^"|"$/g, ""), from: m[2].trim() };
  return { from: raw.trim(), fromName: raw.trim() };
}

function parseMessage(msg: GmailFullMsg) {
  const payload = msg.payload ?? { mimeType: "text/plain" };
  const { html, text } = extractBody(payload);
  const fromRaw = getHeader(payload, "From");
  const { from, fromName } = parseFrom(fromRaw);
  return {
    id: msg.id,
    threadId: msg.threadId,
    from,
    fromName,
    to:      getHeader(payload, "To"),
    cc:      getHeader(payload, "Cc"),
    subject: getHeader(payload, "Subject") || "(no subject)",
    date:    getHeader(payload, "Date"),
    receivedAt: msg.internalDate
      ? new Date(parseInt(msg.internalDate)).toISOString()
      : new Date(getHeader(payload, "Date")).toISOString(),
    snippet:   msg.snippet ?? "",
    isUnread:  (msg.labelIds ?? []).includes("UNREAD"),
    html,
    text,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!process.env.GMAIL_CLIENT_EMAIL || !process.env.GMAIL_PRIVATE_KEY) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  try {
    const token = await getGmailToken();

    // Fetch the full thread (all messages in the conversation)
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${GMAIL_ENCODED}/threads/${id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });

    const thread = await res.json() as { id: string; messages?: GmailFullMsg[] };
    const messages = (thread.messages ?? []).map(parseMessage);

    // Return the first message as the main ticket + all messages for the thread view
    const first = messages[0];
    if (!first) return NextResponse.json({ error: "Empty thread" }, { status: 404 });

    return NextResponse.json({
      ...first,
      messages, // full conversation thread
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
