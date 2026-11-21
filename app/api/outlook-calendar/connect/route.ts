import { NextResponse } from "next/server";
import { MS_USER_SCOPES } from "@/lib/microsoft/scopes";

export function GET() {
  const tenant = process.env.MS_CALENDAR_TENANT_ID ?? "common";
  const params = new URLSearchParams({
    client_id: process.env.MS_CALENDAR_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/outlook-calendar/callback`,
    response_mode: "query",
    scope: MS_USER_SCOPES,
  });

  return NextResponse.redirect(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`
  );
}
