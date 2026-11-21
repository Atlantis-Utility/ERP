import { NextRequest, NextResponse } from "next/server";
import { requireEmployee, ApiAuthError } from "@/lib/api-auth";
import { graphAsUser, NotConnectedError, REFRESH_COOKIE } from "@/lib/microsoft/user-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in person's Teams conversations.
 *
 * Theirs, not the company's: this reads with the token their own Microsoft
 * login produced, so it can only ever return what they can already open in
 * Teams. Somebody who has not signed in with Microsoft gets a plain
 * "not connected" rather than an error.
 */

interface GraphIdentity {
  user?: { displayName?: string; id?: string };
}

interface GraphChat {
  id: string;
  topic?: string | null;
  chatType?: string;
  createdDateTime?: string;
  lastUpdatedDateTime?: string;
  webUrl?: string;
  lastMessagePreview?: {
    id?: string;
    createdDateTime?: string;
    body?: { content?: string; contentType?: string };
    from?: GraphIdentity;
  } | null;
  members?: Array<{ displayName?: string; email?: string; userId?: string }>;
}

/** Graph sends previews as HTML even when the message was plain text. */
function previewText(body: { content?: string; contentType?: string } | undefined): string {
  const raw = body?.content ?? "";
  if (!raw) return "";
  const text = body?.contentType === "html"
    ? raw
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(p|div|li)>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
    : raw;
  return text.replace(/\s+/g, " ").trim();
}

/**
 * What to call a conversation.
 *
 * A group chat usually has a topic. A one-to-one never does, and is named
 * by whoever is in it - minus ourselves, or every row would read as our
 * own name.
 */
function titleOf(chat: GraphChat, me: string): string {
  if (chat.topic) return chat.topic;
  const others = (chat.members ?? [])
    .map((m) => m.displayName?.trim())
    .filter((n): n is string => Boolean(n) && n !== me);
  if (others.length === 0) return chat.chatType === "oneOnOne" ? "Just you" : "Untitled chat";
  if (others.length <= 3) return others.join(", ");
  return `${others.slice(0, 3).join(", ")} and ${others.length - 3} more`;
}

export async function GET(req: NextRequest) {
  try {
    await requireEmployee();

    const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
    if (!refreshToken) {
      return NextResponse.json(
        { connected: false, reason: "Sign in with Microsoft to see your Teams messages here.", chats: [] },
        { status: 200 },
      );
    }

    const top = Math.min(Number(req.nextUrl.searchParams.get("top")) || 30, 50);
    // lastMessagePreview is the whole point of the list view, and it has to
    // be expanded explicitly or every row comes back without its message.
    const data = await graphAsUser<{ value?: GraphChat[] }>(
      refreshToken,
      `/me/chats?$expand=members,lastMessagePreview&$top=${top}` +
        `&$orderby=${encodeURIComponent("lastMessagePreview/createdDateTime desc")}`,
    );

    const me = (await graphAsUser<{ displayName?: string }>(refreshToken, "/me?$select=displayName"))
      .displayName ?? "";

    const chats = (data.value ?? []).map((chat) => ({
      id: chat.id,
      title: titleOf(chat, me),
      kind: chat.chatType ?? "",
      webUrl: chat.webUrl ?? "",
      lastMessage: previewText(chat.lastMessagePreview?.body ?? undefined),
      lastFrom: chat.lastMessagePreview?.from?.user?.displayName ?? "",
      lastAt: chat.lastMessagePreview?.createdDateTime ?? chat.lastUpdatedDateTime ?? "",
      members: (chat.members ?? [])
        .map((m) => m.displayName ?? "")
        .filter(Boolean),
    }));

    return NextResponse.json({ connected: true, me, chats });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof NotConnectedError) {
      // Not a failure to retry: the sign-in needs doing again, and saying
      // so beats a spinner that never resolves.
      return NextResponse.json({ connected: false, reason: err.message, chats: [] }, { status: 200 });
    }
    const message = err instanceof Error ? err.message : "Couldn't read your Teams messages";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
