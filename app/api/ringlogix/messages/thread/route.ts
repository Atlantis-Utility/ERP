import { NextRequest, NextResponse } from "next/server";
import { getMessages, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import {
  normalizeMessage, sortMessages, type RawMessage,
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
    const rows = ((await getMessages(domain, user, session)) ?? []) as RawMessage[];
    return NextResponse.json({ messages: sortMessages(rows.map(normalizeMessage)) });
  } catch (err) {
    return ringlogixFailure(err);
  }
}
