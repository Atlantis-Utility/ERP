import { NextRequest, NextResponse } from "next/server";
import { getRecording, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { denyUnlessEmployee } from "@/lib/ringlogix-guard";
import { normalizeRecordings } from "@/lib/ringlogix-recordings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams one recording's audio.
 *
 * The recording's address is resolved here rather than handed to the
 * browser, for two reasons. It carries an `auth` token and a timestamp, so
 * a link put in a page is both a credential and a thing that stops working
 * - a recording playing today and 404ing tomorrow is worse than one that
 * never played. And the token is the whole authorisation: anybody it
 * reaches can play a customer's call.
 *
 * Resolved fresh on every request for the same reason; it is cheap next to
 * the audio itself.
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
  const index = Number(searchParams.get("index") ?? "0") || 0;

  if (!origCallid && !termCallid) {
    return NextResponse.json({ error: "Which call?" }, { status: 400 });
  }

  try {
    const recordings = normalizeRecordings(await getRecording({ domain, origCallid, termCallid }));
    const one = recordings[index];
    if (!one) {
      return NextResponse.json({ error: "That call has no recording." }, { status: 404 });
    }

    const upstream = await fetch(one.sourceUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `The recording server answered ${upstream.status}.` },
        { status: 502 },
      );
    }

    // Passed through rather than buffered: these run to twenty minutes, and
    // Range support is what lets the player scrub rather than only play.
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") ?? "audio/wav");
    for (const h of ["content-length", "accept-ranges", "content-range"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    // A recording is a customer's call: never let a shared cache keep it.
    headers.set("Cache-Control", "private, no-store");
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    return ringlogixFailure(err);
  }
}
