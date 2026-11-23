import { NextRequest, NextResponse } from "next/server";
import { getRecording, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { denyUnlessEmployee } from "@/lib/ringlogix-guard";
import { normalizeRecordings } from "@/lib/ringlogix-recordings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The recordings of one call.
 *
 * Takes the call's two SIP call-ids rather than a domain and a limit: this
 * API has no way to list a domain's recordings, so the only way in is from
 * a call you already have. The Recordings page walks recent calls and asks
 * about each, which is why it needs the CDR first.
 *
 * The reply deliberately does not carry RingLogix's signed URL. That URL
 * is a bearer credential for the audio - anyone holding it can play the
 * call - so playback goes through /api/ringlogix/recordings/play, which
 * re-resolves it server-side.
 */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessEmployee();
  if (denied) return denied;

  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const domain = searchParams.get("domain")?.trim() || ourDomain();
  const origCallid = searchParams.get("origCallid")?.trim() ?? "";
  const termCallid = searchParams.get("termCallid")?.trim() ?? "";

  if (!origCallid && !termCallid) {
    return NextResponse.json(
      { error: "A recording is looked up by its call, so this needs origCallid or termCallid." },
      { status: 400 },
    );
  }

  try {
    const recordings = normalizeRecordings(await getRecording({ domain, origCallid, termCallid }));
    return NextResponse.json({
      domain,
      recordings: recordings.map((r, i) => ({
        callId: r.callId,
        status: r.status,
        seconds: r.seconds,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        playUrl:
          `/api/ringlogix/recordings/play?domain=${encodeURIComponent(domain)}` +
          `&origCallid=${encodeURIComponent(origCallid)}` +
          `&termCallid=${encodeURIComponent(termCallid)}&index=${i}`,
      })),
    });
  } catch (err) {
    return ringlogixFailure(err);
  }
}
