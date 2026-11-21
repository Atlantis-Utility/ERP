import { NextRequest, NextResponse } from "next/server";
import { requireEmployee, ApiAuthError } from "@/lib/api-auth";
import { getMessageSessions, setMessageSessionStatus, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import type { RawMessageSession } from "@/lib/ringlogix-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Marks a conversation read or unread.
 *
 * The session is checked against the mailbox before anything is written,
 * for the same reason the reply route checks it: the browser names a
 * conversation, and only a conversation we actually hold is a thing we
 * will act on.
 */
export async function POST(req: NextRequest) {
  try {
    await requireEmployee();
    if (!isConfigured()) {
      return NextResponse.json({ error: "RingLogix isn't configured" }, { status: 503 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      sessionId?: string;
      user?: string;
      domain?: string;
      read?: boolean;
    };
    const sessionId = (body.sessionId ?? "").trim();
    const domain = (body.domain ?? "").trim() || ourDomain();
    const read = Boolean(body.read);
    if (!sessionId) return NextResponse.json({ error: "Which conversation?" }, { status: 400 });

    const sessions = ((await getMessageSessions(domain, body.user?.trim() || "*")) ?? []) as RawMessageSession[];
    const session = sessions.find((s) => s.session_id === sessionId);
    if (!session) {
      return NextResponse.json({ error: "That conversation isn't one of ours." }, { status: 400 });
    }

    await setMessageSessionStatus({
      domain,
      user: session.user ?? body.user ?? "",
      sessionId,
      read,
    });
    return NextResponse.json({ ok: true, read });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return ringlogixFailure(err);
  }
}
