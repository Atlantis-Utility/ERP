import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireEmployee, ApiAuthError } from "@/lib/api-auth";
import { authorizeUrl, isDelegatedConfigured, STATE_COOKIE } from "@/lib/microsoft/delegated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starts a Microsoft sign-in for the person who asked.
 *
 * The `state` is a random value held in an httpOnly cookie and echoed back
 * by Microsoft. Without that check, anybody could hand one of our people a
 * link that completes a connection to *their* Microsoft account, and the
 * ERP would then read a stranger's Teams as if it were the employee's.
 */
export async function GET(req: NextRequest) {
  try {
    const actor = await requireEmployee();
    if (!isDelegatedConfigured()) {
      return NextResponse.json({ error: "Microsoft isn't configured on this environment" }, { status: 503 });
    }

    const state = crypto.randomBytes(24).toString("base64url");
    // The origin the browser actually used, so a connection started on
    // localhost comes back to localhost and one started on the live site
    // comes back there. Both have to be registered in Entra.
    const origin = req.nextUrl.origin;

    const res = NextResponse.redirect(authorizeUrl({ origin, state }));
    res.cookies.set(STATE_COOKIE, `${state}:${actor.email.toLowerCase()}`, {
      httpOnly: true,
      secure: req.nextUrl.protocol === "https:",
      sameSite: "lax", // must survive the redirect back from Microsoft
      path: "/",
      maxAge: 600, // ten minutes is longer than any honest sign-in takes
    });
    return res;
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Couldn't start sign-in";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
