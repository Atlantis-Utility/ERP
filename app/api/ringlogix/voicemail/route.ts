import { NextRequest, NextResponse } from "next/server";
import {
  getConversations, getSubscribers, isPersonExtension, isConfigured, ourDomain,
} from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { denyUnlessEmployee } from "@/lib/ringlogix-guard";
import { voicemailsOf, type Voicemail } from "@/lib/ringlogix-voicemail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Every voicemail on a domain.
 *
 * Voicemail has no object of its own: it comes out of the UC Inbox
 * (`conversation/read`), mixed in with chat sessions, and only one
 * extension at a time - the `user=*` wildcard that makes the message list
 * cheap is refused here. So a domain costs one request per extension.
 *
 * Only extensions that are people are asked about. Queues, auto attendants
 * and inbound routes make up most of a domain's subscriber list (54 of them
 * on ours, against 11 staff) and none of them has a mailbox, so asking
 * would be forty wasted requests per load.
 */
const CONCURRENCY = 6;

async function pooled<T, R>(items: T[], work: (item: T) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        out.push(...(await work(items[i])));
      } catch {
        // One mailbox refusing is not a reason to show none of the others.
      }
    }
  });
  await Promise.all(workers);
  return out;
}

export async function GET(req: NextRequest) {
  const denied = await denyUnlessEmployee();
  if (denied) return denied;

  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const domain = searchParams.get("domain")?.trim() || ourDomain();
  const only = searchParams.get("user")?.trim() ?? "";

  try {
    let mailboxes: Array<{ user: string; name: string }>;

    if (only) {
      mailboxes = [{ user: only, name: "" }];
    } else {
      const subscribers = ((await getSubscribers(domain)) ?? []) as Array<Record<string, string>>;
      mailboxes = subscribers
        .filter(isPersonExtension)
        .map((s) => ({
          user: String(s.user ?? "").trim(),
          name: `${s.first_name ?? ""} ${s.last_name ?? ""}`.replace(/\s+/g, " ").trim(),
        }))
        .filter((m) => m.user);
    }

    const names = new Map(mailboxes.map((m) => [m.user, m.name]));

    const found = await pooled(mailboxes, async (box) => {
      const payload = await getConversations(domain, box.user);
      return voicemailsOf(payload, box.user);
    });

    found.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

    return NextResponse.json({
      domain,
      mailboxesAsked: mailboxes.length,
      voicemails: found.map((v: Voicemail) => ({
        id: v.id,
        mailbox: v.mailbox,
        // The staff name for the mailbox, so a row reads "Balijinder
        // Singh's mailbox" rather than "100".
        mailboxName: names.get(v.mailbox) ?? "",
        fromName: v.fromName,
        fromNumber: v.fromNumber,
        seconds: v.seconds,
        recordedAt: v.recordedAt,
        timeZone: v.timeZone,
        bytesLabel: v.bytesLabel,
        transcription: v.transcription,
        forwarded: v.forwarded,
        // Our own proxy, never RingLogix's signed address: that URL is a
        // bearer credential for a customer's voicemail and it expires.
        playUrl:
          `/api/ringlogix/voicemail/play?domain=${encodeURIComponent(domain)}` +
          `&user=${encodeURIComponent(v.mailbox)}&id=${encodeURIComponent(v.id)}`,
      })),
    });
  } catch (err) {
    return ringlogixFailure(err);
  }
}
