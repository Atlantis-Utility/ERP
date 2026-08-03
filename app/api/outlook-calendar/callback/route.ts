import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/calendar?outlook=error`
    );
  }

  const tenant = process.env.MS_CALENDAR_TENANT_ID ?? "common";

  try {
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     process.env.MS_CALENDAR_CLIENT_ID!,
        client_secret: process.env.MS_CALENDAR_CLIENT_SECRET!,
        grant_type:    "authorization_code",
        code,
        redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/outlook-calendar/callback`,
        scope:         "offline_access Calendars.Read",
      }),
      cache: "no-store",
    });

    const tokens = await tokenRes.json() as { refresh_token?: string; access_token?: string; error?: string; error_description?: string };
    if (!tokenRes.ok || !tokens.refresh_token) {
      console.error(
        `[outlook-calendar:callback] token exchange failed: status=${tokenRes.status} error=${tokens.error} error_description=${tokens.error_description}`
      );
      throw new Error("token_exchange_failed");
    }

    const res = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/calendar?outlook=connected`
    );

    res.cookies.set("outlook_refresh", tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 90, // 90 days
      path: "/",
    });

    // Non-httpOnly flag so the client can check connection status
    res.cookies.set("outlook_connected", "1", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 90,
      path: "/",
    });

    return res;
  } catch (err) {
    if (!(err instanceof Error && err.message === "token_exchange_failed")) {
      console.error("[outlook-calendar:callback] unexpected failure", err);
    }
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/calendar?outlook=error`
    );
  }
}
