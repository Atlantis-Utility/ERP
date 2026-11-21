import { NextRequest, NextResponse } from "next/server";
import { requireEmployee, ApiAuthError } from "@/lib/api-auth";
import { getMessageSessions, sendMessage, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { digitsOf, remoteNumbersOf, type RawMessageSession } from "@/lib/ringlogix-messages";
import { recordSender } from "@/lib/messages/senders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LENGTH = 1600;

/**
 * Starts a conversation with a number we have never texted.
 *
 * Distinct from replying, which takes its destination from the thread and
 * so can only ever answer somebody who wrote first. Here the number comes
 * from a person typing it, which is the one way a text from this app can
 * reach a stranger - so the number is checked, the sending number has to
 * be one of ours, and the caller is recorded against the message.
 *
 * A number already in the mailbox is not an error: it is simply a reply,
 * and the answer says which conversation it joined so the page can open
 * that rather than appear to have made a second one.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireEmployee();
    if (!isConfigured()) {
      return NextResponse.json({ error: "RingLogix isn't configured" }, { status: 503 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      to?: string;
      text?: string;
      fromNumber?: string;
      domain?: string;
    };

    const domain = (body.domain ?? "").trim() || ourDomain();
    const text = (body.text ?? "").trim();
    // One number, or several for a group - the PBX addresses a group by
    // listing them, comma separated.
    const recipients = String(body.to ?? "")
      .split(/[,;\s]+/)
      .map((x) => digitsOf(x))
      .filter(Boolean);
    const fromNumber = digitsOf(body.fromNumber);

    if (!text) return NextResponse.json({ error: "Nothing to send" }, { status: 400 });
    if (text.length > MAX_LENGTH) {
      return NextResponse.json(
        { error: `That's ${text.length} characters; the limit is ${MAX_LENGTH}.` },
        { status: 400 },
      );
    }

    // Ten digits, or eleven starting with a 1. Anything else is a typo,
    // and a typo in this field is the whole risk of the feature - so
    // every one of them is checked, not just the first.
    if (recipients.length === 0) {
      return NextResponse.json({ error: "Who is this going to?" }, { status: 400 });
    }
    if (recipients.length > 10) {
      return NextResponse.json(
        { error: "That's more than ten people — send a broadcast from Quick Access instead." },
        { status: 400 },
      );
    }
    const numbers: string[] = [];
    for (const one of recipients) {
      const national = one.length === 11 && one.startsWith("1") ? one.slice(1) : one;
      if (national.length !== 10) {
        return NextResponse.json(
          { error: `"${one}" doesn't look like a US number — ten digits, please.` },
          { status: 400 },
        );
      }
      if (!numbers.includes(`1${national}`)) numbers.push(`1${national}`);
    }
    const destination = numbers.join(",");

    // The sending number has to be one of ours, and which ones those are
    // is learned from the mailbox rather than taken from the request.
    const sessions = ((await getMessageSessions(domain, "*")) ?? []) as RawMessageSession[];
    const ours = new Map<string, string>(); // our number -> extension that owns it
    for (const s of sessions) {
      const ani = digitsOf(s.smsani);
      if (ani && s.user && !ours.has(ani)) ours.set(ani, s.user);
    }
    const user = ours.get(fromNumber);
    if (!user) {
      return NextResponse.json({ error: "That isn't one of our SMS numbers to send from." }, { status: 400 });
    }

    // Already talking to them on that number? Then this belongs in the
    // conversation that already exists.
    // The same set of people on the same number of ours is the same
    // conversation, whatever order they were typed in.
    const key = [...numbers].sort().join(",");
    const existing = sessions.find(
      (s) =>
        digitsOf(s.smsani) === fromNumber &&
        [...remoteNumbersOf(s.remote)].sort().join(",") === key,
    );

    const created = (await sendMessage({
      domain, user, destination, message: text, fromNumber,
    })) as { id?: string; session_id?: string } | null;

    await recordSender({
      messageId: created?.id ?? "",
      sessionId: created?.session_id ?? existing?.session_id ?? "",
      name: actor.name || actor.email,
      email: actor.email,
    });

    console.log(`[sms] ${actor.email} started a conversation with ${destination} as ${fromNumber}`);
    return NextResponse.json({
      ok: true,
      destination,
      from: fromNumber,
      sessionId: created?.session_id ?? existing?.session_id ?? "",
      joinedExisting: Boolean(existing),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return ringlogixFailure(err);
  }
}
