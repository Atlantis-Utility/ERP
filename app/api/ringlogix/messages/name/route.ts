import { NextRequest, NextResponse } from "next/server";
import { requireEmployee, ApiAuthError } from "@/lib/api-auth";
import { getMessageSessions, setMessageSessionName, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import type { RawMessageSession } from "@/lib/ringlogix-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Long enough for "Salzer's - Friday install", short enough for a list. */
const MAX_NAME = 60;

/**
 * Names a conversation, or clears the name by sending an empty one.
 *
 * The session is checked against the mailbox first, for the same reason
 * every other write here does: the browser names a conversation, and only
 * one we actually hold is something we will act on.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireEmployee();
    if (!isConfigured()) {
      return NextResponse.json({ error: "RingLogix isn't configured" }, { status: 503 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      sessionId?: string;
      user?: string;
      domain?: string;
      name?: string;
    };

    const sessionId = (body.sessionId ?? "").trim();
    const domain = (body.domain ?? "").trim() || ourDomain();
    // Collapsed, because a name with a newline in it breaks every list
    // it appears in and nobody meant to type one.
    const name = (body.name ?? "").replace(/\s+/g, " ").trim();

    if (!sessionId) return NextResponse.json({ error: "Which conversation?" }, { status: 400 });
    if (name.length > MAX_NAME) {
      return NextResponse.json(
        { error: `That's ${name.length} characters; keep it under ${MAX_NAME}.` },
        { status: 400 },
      );
    }

    const sessions = ((await getMessageSessions(domain, body.user?.trim() || "*")) ?? []) as RawMessageSession[];
    const session = sessions.find((s) => s.session_id === sessionId);
    if (!session) {
      return NextResponse.json({ error: "That conversation isn't one of ours." }, { status: 400 });
    }

    await setMessageSessionName({
      domain,
      user: session.user ?? body.user ?? "",
      sessionId,
      name,
    });

    console.log(`[sms] ${actor.email} ${name ? `named a conversation "${name}"` : "cleared a conversation's name"}`);
    return NextResponse.json({ ok: true, name });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return ringlogixFailure(err);
  }
}
