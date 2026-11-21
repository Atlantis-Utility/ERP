import { NextRequest, NextResponse } from "next/server";
import { requireEmployee, ApiAuthError } from "@/lib/api-auth";
import { getMessageSessions, sendMessage, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { digitsOf, type RawMessageSession } from "@/lib/ringlogix-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LENGTH = 1600; // ten segments; past this a carrier starts dropping

/**
 * Replies to a text.
 *
 * Deliberately a *reply*, not a send: the destination is not taken from
 * the request at all, it is looked up from the conversation being replied
 * to. A browser can therefore only ever write back to somebody who has
 * already written to us, and a typo in a number cannot reach a stranger -
 * the same rule the customer broadcast uses, for the same reason.
 *
 * Starting a brand-new conversation is a separate thing and is not this.
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
      text?: string;
    };

    const text = (body.text ?? "").trim();
    const sessionId = (body.sessionId ?? "").trim();
    const user = (body.user ?? "").trim();
    const domain = (body.domain ?? "").trim() || ourDomain();

    if (!text) return NextResponse.json({ error: "Nothing to send" }, { status: 400 });
    if (text.length > MAX_LENGTH) {
      return NextResponse.json({ error: `That's ${text.length} characters; the limit is ${MAX_LENGTH}.` }, { status: 400 });
    }
    if (!sessionId) return NextResponse.json({ error: "Which conversation?" }, { status: 400 });

    // The destination comes from the conversation, never from the caller.
    const sessions = ((await getMessageSessions(domain, user || "*")) ?? []) as RawMessageSession[];
    const session = sessions.find((s) => s.session_id === sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "That conversation isn't one of ours, so there's nobody to reply to." },
        { status: 400 },
      );
    }

    const destination = digitsOf(session.remote);
    if (!destination) {
      return NextResponse.json({ error: "That conversation has no number on it." }, { status: 400 });
    }

    // Sent from the extension that holds the thread, so the reply comes
    // from the number they already know and stays in the same conversation
    // rather than opening a second one.
    const from = session.user ?? user;
    await sendMessage({ domain, user: from, destination, message: text });

    console.log(`[sms] ${actor.email} replied to ${destination} from extension ${from || "(none)"}`);
    return NextResponse.json({ ok: true, destination, from });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return ringlogixFailure(err);
  }
}
