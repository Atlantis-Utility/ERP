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
  const user = searchParams.get("user")?.trim() ?? "";
  const session = searchParams.get("session")?.trim() ?? "";

  // All three are required by the API itself; saying so here beats a
  // "Please include domain and user fields" surfacing as a 500.
  if (!domain || !user || !session) {
    return NextResponse.json(
      { error: "A thread needs a domain, an extension and a session id" },
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
