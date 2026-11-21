import { NextRequest, NextResponse } from "next/server";
import { getMessages, getSubscribers, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import {
  normalizeMessage, sortMessages, namesByExtension, type RawMessage,
} from "@/lib/ringlogix-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One conversation, oldest message first. */
export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const domain = searchParams.get("domain")?.trim() || ourDomain();
  // Deliberately not rejected when empty: two of our conversations belong
  // to no extension at all, and the API reads those with an empty user.
  // What it will not take here is the "*" the session list accepts.
  const user = (searchParams.get("user") ?? "").trim();
  const session = searchParams.get("session")?.trim() ?? "";

  if (!domain || !session) {
    return NextResponse.json(
      { error: "A thread needs a domain and a session id" },
      { status: 400 },
    );
  }
  if (user === "*") {
    return NextResponse.json(
      { error: "A thread belongs to one extension; the wildcard only lists sessions" },
      { status: 400 },
    );
  }

  try {
    const [rows, subscribers] = await Promise.all([
      getMessages(domain, user, session) as Promise<RawMessage[]>,
      // Cached for three minutes alongside every other read, so naming
      // the sender costs nothing after the first thread is opened.
      getSubscribers(domain).catch(() => []) as Promise<Array<Record<string, string>>>,
    ]);
    const names = namesByExtension(subscribers ?? []);
    const messages = sortMessages(
      (rows ?? []).map((raw) => normalizeMessage(raw, { owner: user, names })),
    );
    return NextResponse.json({ messages, names });
  } catch (err) {
    return ringlogixFailure(err);
  }
}
