import { NextRequest, NextResponse } from "next/server";
import { requireEmployee, ApiAuthError } from "@/lib/api-auth";
import { getMessages, isConfigured, ourDomain, ringlogixAuthHeader } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import type { RawMessage } from "@/lib/ringlogix-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The picture (or file) attached to a message.
 *
 * RingLogix stores it behind a URL that needs our bearer token, so the
 * browser cannot load it directly - it comes through here instead.
 *
 * The URL is never taken from the request. The caller names a message and
 * the server reads that message's own `remotepath`, which is the
 * difference between a media proxy and an open redirect that will fetch
 * anything anybody asks it to. The host is checked as well, in case a
 * stored path ever points somewhere it shouldn't.
 */
const ALLOWED_HOST = /(^|\.)ringlogix\.com$/i;

export async function GET(req: NextRequest) {
  try {
    await requireEmployee();
    if (!isConfigured()) return NextResponse.json({ error: "RingLogix isn't configured" }, { status: 503 });

    const { searchParams } = req.nextUrl;
    const domain = searchParams.get("domain")?.trim() || ourDomain();
    const user = (searchParams.get("user") ?? "").trim();
    const session = (searchParams.get("session") ?? "").trim();
    const id = (searchParams.get("id") ?? "").trim();
    if (!domain || !session || !id) {
      return NextResponse.json({ error: "Which attachment?" }, { status: 400 });
    }

    const rows = ((await getMessages(domain, user, session)) ?? []) as RawMessage[];
    const message = rows.find((m) => m.id === id);
    const path = (message?.remotepath ?? "").trim();
    if (!message || !path) {
      return NextResponse.json({ error: "That message has no attachment." }, { status: 404 });
    }

    let target: URL;
    try {
      target = new URL(path);
    } catch {
      return NextResponse.json({ error: "That attachment's address isn't usable." }, { status: 502 });
    }
    if (target.protocol !== "https:" || !ALLOWED_HOST.test(target.hostname)) {
      return NextResponse.json({ error: "That attachment isn't hosted where it should be." }, { status: 502 });
    }

    const upstream = await fetch(target, {
      headers: { Authorization: await ringlogixAuthHeader() },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `RingLogix wouldn't hand over the attachment (${upstream.status})` },
        { status: 502 },
      );
    }

    const type = message.media_type?.trim() || upstream.headers.get("content-type") || "application/octet-stream";
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": type,
        // Private: it is somebody's message, not a public asset, and it
        // must not sit in a shared cache.
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="attachment-${id.slice(0, 8)}"`,
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return ringlogixFailure(err);
  }
}
