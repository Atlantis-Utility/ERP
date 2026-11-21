import "server-only";

/**
 * Calling Graph as the signed-in person, using the token their Microsoft
 * login already produced.
 *
 * The app signs people in with Microsoft and asks for `offline_access` as
 * part of that same grant, so Microsoft hands back a refresh token at
 * sign-in and it is kept in the httpOnly `outlook_refresh` cookie
 * (app/auth/callback/route.ts). Nothing extra to connect, nothing extra to
 * consent to - which is the whole point: the licence they already pay for
 * is what grants this.
 *
 * Reading as the person, rather than as the company, also keeps the app on
 * the right side of Microsoft's line: the application-permission versions
 * of the Teams chat APIs are "protected", needing an approval request and
 * per-message billing, while the delegated ones are ordinary Graph. And it
 * is simply correct - the ERP shows somebody their own messages, not
 * everyone's.
 */

export const REFRESH_COOKIE = "outlook_refresh";

/** Thrown when there is no usable Microsoft token for this browser. */
export class NotConnectedError extends Error {
  constructor(message = "No Microsoft sign-in on this browser") {
    super(message);
    this.name = "NotConnectedError";
  }
}

/**
 * Swaps the stored refresh token for an access token.
 *
 * Access tokens last about an hour and are not stored: a refresh is one
 * round trip, and keeping them would mean a second credential at rest and
 * a cache to invalidate for no gain.
 */
export async function accessTokenFrom(refreshToken: string): Promise<string> {
  const tenant = process.env.MS_CALENDAR_TENANT_ID ?? "common";
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CALENDAR_CLIENT_ID ?? "",
      client_secret: process.env.MS_CALENDAR_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });
  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!data.access_token) {
    // A refresh token dies when the password changes, sessions are
    // revoked, or consent is withdrawn - and the fix for all three is the
    // same: sign in again. Keep Microsoft's own wording for the cases that
    // are none of those.
    throw new NotConnectedError(
      data.error_description?.split("\n")[0] ?? data.error ?? "Microsoft wouldn't renew the sign-in",
    );
  }
  return data.access_token;
}

/**
 * One Graph call as this person.
 *
 * `path` is relative, e.g. "/me/chats?$top=20". A 403 here usually means
 * the scope was never consented - the token predates the scope being added
 * to MS_USER_SCOPES - and signing in again fixes it, so it is reported as
 * a sign-in problem rather than a server error.
 */
export async function graphAsUser<T>(refreshToken: string, path: string): Promise<T> {
  const token = await accessTokenFrom(refreshToken);
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    const detail = (() => {
      try {
        return (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? "";
      } catch {
        return text.slice(0, 200);
      }
    })();
    if (res.status === 401 || res.status === 403) {
      throw new NotConnectedError(
        `Microsoft refused this read — sign in again to grant it. (${detail || res.status})`,
      );
    }
    throw new Error(`Graph ${path.split("?")[0]} ${res.status}: ${detail}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}
