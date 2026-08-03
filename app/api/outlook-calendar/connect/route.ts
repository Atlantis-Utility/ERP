import { NextResponse } from "next/server";

export function GET() {
  const tenant = process.env.MS_CALENDAR_TENANT_ID ?? "common";
  const params = new URLSearchParams({
    client_id: process.env.MS_CALENDAR_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/outlook-calendar/callback`,
    response_mode: "query",
    scope: "offline_access Calendars.Read",
  });

  return NextResponse.redirect(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`
  );
}
