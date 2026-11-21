import { NextRequest, NextResponse } from "next/server";
import { requireEmployee, ApiAuthError } from "@/lib/api-auth";
import { getMessageSessions, sendMessage, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { digitsOf, extensionOf, remoteNumbersOf, type RawMessageSession } from "@/lib/ringlogix-messages";
import { recordSender } from "@/lib/messages/senders";

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

    // A colleague's thread carries an extension where a customer's carries
    // a number; both are valid destinations, and which one decides whether
    // this is a text or an internal chat.
    const remoteExtension = extensionOf(session.remote);
    // A group carries several numbers and is addressed to all of them at
    // once; replying to only the first would quietly split the thread.
    const numbers = remoteNumbersOf(session.remote);
    const destination = remoteExtension || numbers.join(",");
    if (!destination) {
      return NextResponse.json({ error: "That conversation has nobody on the other end." }, { status: 400 });
    }

    // Our number on this thread. Required for a text - without it
    // RingLogix accepts the message as an internal chat and it never
    // leaves the building.
    const fromNumber = remoteExtension ? undefined : digitsOf(session.smsani);
    if (!remoteExtension && !fromNumber) {
      return NextResponse.json(
        { error: "That conversation has no number of ours on it to send from." },
        { status: 400 },
      );
    }

    // Sent from the extension that holds the thread, so the reply comes
    // from the number they already know and stays in the same conversation
    // rather than opening a second one.
    const from = session.user ?? user;
    const created = (await sendMessage({
      domain, user: from, destination, message: text, fromNumber,
    })) as { id?: string } | null;

    // RingLogix returns the message's own id and it is the same id the
    // message carries when read back, so the person who sent it can be
    // attached to that exact message rather than inferred later.
    await recordSender({
      messageId: created?.id ?? "",
      sessionId,
      name: actor.name || actor.email,
      email: actor.email,
    });

    console.log(
      `[sms] ${actor.email} replied to ${destination} from extension ${from || "(none)"}` +
      `${fromNumber ? ` as ${fromNumber}` : " (internal chat)"}`,
    );
    return NextResponse.json({ ok: true, destination, from, as: fromNumber ?? "" });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return ringlogixFailure(err);
  }
}
