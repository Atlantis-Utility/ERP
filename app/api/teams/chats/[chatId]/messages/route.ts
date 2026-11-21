import { NextRequest, NextResponse } from "next/server";
import { requireEmployee, ApiAuthError } from "@/lib/api-auth";
import { graphAsUser, NotConnectedError, REFRESH_COOKIE } from "@/lib/microsoft/user-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GraphChatMessage {
  id: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  deletedDateTime?: string | null;
  /** "message" for something a person wrote; "systemEventMessage" for joins and leaves. */
  messageType?: string;
  from?: { user?: { displayName?: string; id?: string }; application?: { displayName?: string } } | null;
  body?: { content?: string; contentType?: string };
  attachments?: Array<{ id?: string; name?: string | null; contentType?: string }>;
}

/**
 * Teams renders messages as HTML, including ones typed as plain text.
 * Line breaks carry meaning in a chat, so they survive; everything else
 * goes, because this is rendered as text and injecting a stranger's markup
 * into our page is not a thing to do.
 */
function toText(body: { content?: string; contentType?: string } | undefined): string {
  const raw = body?.content ?? "";
  if (!raw) return "";
  if (body?.contentType !== "html") return raw.trim();
  const withBreaks = raw
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return withBreaks
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l, i, all) => !(l === "" && all[i - 1] === ""))
    .join("\n")
    .trim();
}

/** One Teams conversation, oldest message first. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    await requireEmployee();
    const { chatId } = await params;

    const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
    if (!refreshToken) {
      return NextResponse.json(
        { connected: false, reason: "Sign in with Microsoft to see your Teams messages here.", messages: [] },
        { status: 200 },
      );
    }

    const top = Math.min(Number(req.nextUrl.searchParams.get("top")) || 40, 50);
    const data = await graphAsUser<{ value?: GraphChatMessage[] }>(
      refreshToken,
      `/me/chats/${encodeURIComponent(chatId)}/messages?$top=${top}`,
    );

    const messages = (data.value ?? [])
      // "X added Y to the chat" is not a message anybody wants to read back.
      .filter((m) => m.messageType === "message" && !m.deletedDateTime)
      .map((m) => ({
        id: m.id,
        at: m.createdDateTime ?? "",
        // A connector or bot posts as an application rather than a person,
        // which is exactly how a texting integration shows up.
        from: m.from?.user?.displayName ?? m.from?.application?.displayName ?? "",
        fromApp: Boolean(m.from?.application && !m.from?.user),
        authorId: m.from?.user?.id ?? "",
        text: toText(m.body),
        attachments: (m.attachments ?? [])
          .map((a) => a.name ?? a.contentType ?? "")
          .filter(Boolean),
      }))
      .filter((m) => m.text || m.attachments.length > 0)
      .sort((a, b) => a.at.localeCompare(b.at));

    const me = await graphAsUser<{ id?: string; displayName?: string }>(
      refreshToken,
      "/me?$select=id,displayName",
    );

    return NextResponse.json({ connected: true, meId: me.id ?? "", messages });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof NotConnectedError) {
      return NextResponse.json({ connected: false, reason: err.message, messages: [] }, { status: 200 });
    }
    const message = err instanceof Error ? err.message : "Couldn't read that conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
