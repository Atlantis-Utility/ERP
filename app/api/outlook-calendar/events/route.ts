import { NextRequest, NextResponse } from "next/server";

interface GraphAttendee {
  emailAddress?: { name?: string; address?: string };
  status?: { response?: string };
  type?: string;
}

interface GraphEvent {
  id: string;
  subject?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  isAllDay?: boolean;
  webLink?: string;
  onlineMeeting?: { joinUrl?: string } | null;
  location?: { displayName?: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
  attendees?: GraphAttendee[];
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
}

// Converts an event body's HTML into plain text, preserving line breaks
// where the markup implies them, so the description reads naturally.
function htmlToText(html: string): string {
  const raw = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");

  // Empty <p>/<div> elements (often just "&nbsp;") leave whitespace-only
  // lines between real newlines, which a bare \n{3,} collapse won't catch.
  // Trim every line first, then drop repeats of blank lines down to one.
  const lines: string[] = [];
  for (const line of raw.split(/\r?\n/).map((l) => l.trim())) {
    if (line === "" && lines[lines.length - 1] === "") continue;
    lines.push(line);
  }
  return lines.join("\n").trim();
}

// Access tokens are normally valid ~60-90 minutes, but this route was refreshing
// one from Microsoft on every single request — a full extra network round-trip
// before Graph was even called. Cache it in-process (keyed by refresh token, so
// a token rotation or different user never serves a stale one) and skip the
// refresh call entirely while it's still good.
interface CachedToken { accessToken: string; expiresAt: number; refreshToken: string; }
let cachedToken: CachedToken | null = null;

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number } | null> {
  const tenant = process.env.MS_CALENDAR_TENANT_ID ?? "common";
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.MS_CALENDAR_CLIENT_ID!,
      client_secret: process.env.MS_CALENDAR_CLIENT_SECRET!,
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
      scope:         "offline_access Calendars.Read",
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 };
}

async function getAccessToken(refreshToken: string): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && cachedToken.refreshToken === refreshToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.accessToken;
  }
  const result = await refreshAccessToken(refreshToken);
  if (!result) {
    cachedToken = null;
    return null;
  }
  cachedToken = { accessToken: result.accessToken, expiresAt: now + result.expiresIn * 1000, refreshToken };
  return cachedToken.accessToken;
}

export async function GET(req: NextRequest) {
  const refreshToken = req.cookies.get("outlook_refresh")?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  const timeMin = req.nextUrl.searchParams.get("timeMin") ?? new Date().toISOString();
  const timeMax = req.nextUrl.searchParams.get("timeMax") ?? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

  const accessToken = await getAccessToken(refreshToken);
  if (!accessToken) {
    const res = NextResponse.json({ error: "Auth expired" }, { status: 401 });
    res.cookies.delete("outlook_refresh");
    res.cookies.delete("outlook_connected");
    return res;
  }

  try {
    const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
    url.searchParams.set("startDateTime", timeMin);
    url.searchParams.set("endDateTime", timeMax);
    url.searchParams.set("$orderby", "start/dateTime");
    url.searchParams.set("$top", "250");
    url.searchParams.set("$select", "id,subject,start,end,isAllDay,webLink,onlineMeeting,location,organizer,attendees,bodyPreview,body");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
      cache: "no-store",
    });

    if (!response.ok) throw new Error("graph_request_failed");

    const data = await response.json() as { value?: GraphEvent[] };

    const events = (data.value ?? []).map((e) => ({
      id:            e.id,
      title:         e.subject ?? "(No title)",
      start:         e.start?.dateTime ?? "",
      end:           e.end?.dateTime   ?? "",
      htmlLink:      e.webLink ?? null,
      onlineJoinUrl: e.onlineMeeting?.joinUrl ?? null,
      isAllDay:      e.isAllDay ?? false,
      location:      e.location?.displayName || null,
      organizer:     e.organizer?.emailAddress
        ? { name: e.organizer.emailAddress.name ?? e.organizer.emailAddress.address ?? "", email: e.organizer.emailAddress.address ?? "" }
        : null,
      attendees: (e.attendees ?? [])
        .filter((a) => a.type !== "resource")
        .map((a) => ({
          name:   a.emailAddress?.name ?? a.emailAddress?.address ?? "",
          email:  a.emailAddress?.address ?? "",
          status: a.status?.response ?? "none",
        })),
      description: e.body?.content
        ? (e.body.contentType?.toLowerCase() === "html" ? htmlToText(e.body.content) : e.body.content.trim())
        : (e.bodyPreview?.trim() || null),
    }));

    return NextResponse.json({ events });
  } catch {
    // The Graph call itself failed (often a token Microsoft has invalidated
    // server-side, e.g. a revoked consent) — don't keep serving that same
    // cached access token on the next request.
    cachedToken = null;
    return NextResponse.json({ error: "Auth expired" }, { status: 401 });
  }
}
