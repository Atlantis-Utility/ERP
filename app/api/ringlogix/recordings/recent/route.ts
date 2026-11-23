import { NextRequest, NextResponse } from "next/server";
import { getCDRsPaged, getRecording, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { denyUnlessEmployee } from "@/lib/ringlogix-guard";
import { normalizeCdrs, type RawCdr, type CallRecord } from "@/lib/ringlogix-cdr";
import { normalizeRecordings } from "@/lib/ringlogix-recordings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The recorded calls of the last few days.
 *
 * There is no endpoint that lists a domain's recordings - `recording/read`
 * is keyed on a single call - so the only way to show a list is to walk
 * recent calls and ask about each one. That is the whole reason this route
 * exists instead of the page asking directly.
 *
 * It is a lot of requests, so: only calls that were actually answered and
 * ran long enough to be worth recording are asked about, the walk is
 * pooled, and the window is deliberately short. A call that was not
 * recorded answers 404, which is the common case and not an error.
 */
const CONCURRENCY = 8;
const MAX_SCAN = 400;

/** Runs `work` over `items` a few at a time, keeping the failures quiet. */
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
        // One call refusing is not a reason to show none of the others.
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
  const days = Math.min(Math.max(Number(searchParams.get("days") ?? "7") || 7, 1), 31);
  const scan = Math.min(Number(searchParams.get("scan") ?? "200") || 200, MAX_SCAN);

  try {
    // Paged, not a single big read: asking for more than a hundred at once
    // drops the nested CdrR from every row, and CdrR is the only place the
    // call-ids a recording lookup needs are carried. See CDR_DETAIL_LIMIT.
    const rows = (await getCDRsPaged({
      domain,
      startDate: new Date(Date.now() - days * 86_400_000),
      endDate: new Date(),
      max: scan,
    })) as unknown as RawCdr[];

    const calls = normalizeCdrs(rows);

    // Only calls that could plausibly have audio: ones with call-ids to ask
    // about, that carried some talk time.
    //
    // Not filtered on `answered`. That was the first attempt and it found
    // nothing at all: a call routed to voicemail or an auto-attendant ends
    // at the media server, which makes `answered` false, and those calls
    // are recorded - the voicemail itself is the recording. Filtering them
    // out discarded every recording on the domain and reported "0 found"
    // on a domain with recordings going back weeks.
    const worth = calls.filter((c) => (c.origCallid || c.termCallid) && c.talkSec > 0);

    const found = await pooled(worth, async (call: CallRecord) => {
      const recordings = normalizeRecordings(
        await getRecording({ domain, origCallid: call.origCallid, termCallid: call.termCallid }),
      );
      return recordings.map((r, i) => ({
        call,
        recording: {
          callId: r.callId,
          status: r.status,
          seconds: r.seconds,
          startedAt: r.startedAt,
          endedAt: r.endedAt,
          playUrl:
            `/api/ringlogix/recordings/play?domain=${encodeURIComponent(domain)}` +
            `&origCallid=${encodeURIComponent(call.origCallid)}` +
            `&termCallid=${encodeURIComponent(call.termCallid)}&index=${i}`,
        },
      }));
    });

    found.sort((a, b) => b.call.startedAt - a.call.startedAt);

    // One conversation is several CDR legs, and the legs share a
    // `term_callid`, so the same audio comes back once per leg - a
    // twenty-minute call showed up four times. Keyed on when the audio
    // starts and how long it runs rather than on its call id, for the same
    // reason normalizeRecordings is: the call id carries the recording
    // server, so one recording held on two servers has two ids.
    //
    // The newest leg wins, which after the sort above is the first seen.
    const kept = new Set<string>();
    const unique = found.filter(({ recording }) => {
      const key = `${recording.startedAt}|${recording.seconds}`;
      if (kept.has(key)) return false;
      kept.add(key);
      return true;
    });

    return NextResponse.json({
      domain,
      days,
      // Said plainly so the page can explain an empty list: "none of the
      // 183 calls we looked at were recorded" reads very differently from
      // "no recordings", which is what it used to say for every reason.
      callsScanned: calls.length,
      callsAsked: worth.length,
      items: unique,
    });
  } catch (err) {
    return ringlogixFailure(err);
  }
}
