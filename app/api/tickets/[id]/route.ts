import { NextResponse } from "next/server";
import { getGraphToken, TICKET_MAILBOX_ENCODED } from "../_ms-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GraphRecipient { emailAddress?: { address?: string; name?: string } }

interface GraphFullMessage {
  id: string;
  conversationId: string;
  subject?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  receivedDateTime?: string;
  bodyPreview?: string;
  isRead?: boolean;
  body?: { contentType?: string; content?: string };
}

function joinRecipients(list?: GraphRecipient[]): string {
  return (list ?? []).map((r) => r.emailAddress?.address).filter(Boolean).join(", ");
}

function parseMessage(msg: GraphFullMessage) {
  const isHtml = msg.body?.contentType?.toLowerCase() === "html";
  return {
    id:         msg.id,
    threadId:   msg.conversationId,
    from:       msg.from?.emailAddress?.address ?? "",
    fromName:   msg.from?.emailAddress?.name ?? msg.from?.emailAddress?.address ?? "",
    to:         joinRecipients(msg.toRecipients),
    cc:         joinRecipients(msg.ccRecipients),
    subject:    msg.subject || "(no subject)",
    date:       msg.receivedDateTime ?? "",
    receivedAt: msg.receivedDateTime ?? new Date().toISOString(),
    snippet:    msg.bodyPreview ?? "",
    isUnread:   msg.isRead === false,
    html:       isHtml ? msg.body?.content ?? null : null,
    text:       !isHtml ? msg.body?.content ?? null : null,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!process.env.MS_TICKETS_CLIENT_ID || !process.env.MS_TICKETS_CLIENT_SECRET || !process.env.MS_TICKETS_TENANT_ID) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  try {
    const token = await getGraphToken();

    // id is the conversationId: fetch every message in that conversation.
    // Graph rejects $filter on conversationId combined with $orderby as
    // "InefficientFilter", so sort client-side instead.
    const url = new URL(`https://graph.microsoft.com/v1.0/users/${TICKET_MAILBOX_ENCODED}/messages`);
    url.searchParams.set("$filter", `conversationId eq '${id}'`);
    url.searchParams.set("$select", "id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,isRead,body");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });

    const data = await res.json() as { value?: GraphFullMessage[] };
    const messages = (data.value ?? [])
      .map(parseMessage)
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

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
