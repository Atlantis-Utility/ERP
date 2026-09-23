import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ZOHO_STATE_COOKIE, zohoAuthorizeUrl, zohoConfigured } from "@/lib/zoho-auth";
import { appOrigin } from "@/lib/app-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Step one: off to Zoho, with a state value we'll insist on seeing back. */
export async function GET(req: Request) {
  if (!zohoConfigured()) {
    return NextResponse.redirect(new URL("/login?error=zoho_not_configured", appOrigin(req)));
  }

  const state = randomUUID();
  const redirectUri = `${appOrigin(req)}/api/auth/zoho/callback`;
  const res = NextResponse.redirect(zohoAuthorizeUrl({ redirectUri, state }));

  // httpOnly so the page can't read it, and short lived: this only has to
  // survive the trip to Zoho and back. Without it, anyone could feed the
  // callback a code of their choosing.
  res.cookies.set(ZOHO_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: !redirectUri.startsWith("http://localhost"),
    path: "/",
    maxAge: 600,
  });
  return res;
}
