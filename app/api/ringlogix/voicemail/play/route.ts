import { NextRequest, NextResponse } from "next/server";
import { getConversations, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { denyUnlessEmployee } from "@/lib/ringlogix-guard";
import { voicemailsOf } from "@/lib/ringlogix-voicemail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams one voicemail.
 *
 * The address is resolved here rather than put in the page: it carries an
 * `auth` token and a timestamp, so handing it to a browser means handing
 * out a credential for a customer's voicemail that will also stop working
 * tomorrow. Re-resolved on every request, which costs one cheap call next
 * to the audio.
 *
 * `remotepath` arrives HTML-escaped and is answered 400 if fetched that
 * way; `decodeAudioUrl` in lib/ringlogix-voicemail.ts handles it.
 */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessEmployee();
  if (denied) return denied;

  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const domain = searchParams.get("domain")?.trim() || ourDomain();
  const user = searchParams.get("user")?.trim() ?? "";
  const id = searchParams.get("id")?.trim() ?? "";

  if (!user || !id) {
    return NextResponse.json({ error: "Which voicemail? This needs a user and an id." }, { status: 400 });
  }

  try {
    const one = voicemailsOf(await getConversations(domain, user), user).find((v) => v.id === id);
    if (!one) {
      return NextResponse.json({ error: "That voicemail isn't in this mailbox." }, { status: 404 });
    }

    const upstream = await fetch(one.sourceUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `The voicemail server answered ${upstream.status}.` },
        { status: 502 },
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") ?? "audio/wav");
    for (const h of ["content-length", "accept-ranges", "content-range"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    // Somebody's voicemail: never let a shared cache hold onto it.
    headers.set("Cache-Control", "private, no-store");
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    return ringlogixFailure(err);
  }
}
