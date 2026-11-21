import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret, type EncryptedSecret } from "@/lib/vault-crypto";

/**
 * Acting as a person at Microsoft, rather than as the company.
 *
 * The app already talks to Graph with client credentials (the shared ticket
 * mailbox). That is the wrong shape for Teams: the application-permission
 * chat APIs are "protected", which means an approval request to Microsoft
 * and per-message billing through an Azure subscription, and it would hand
 * the ERP every chat in the tenant whether or not anyone wanted that.
 *
 * Signing each person in avoids both. Microsoft's own documentation is
 * explicit that the protected APIs "all use Microsoft Graph application
 * permissions"; the delegated equivalents are ordinary Graph. The app then
 * sees precisely what that person sees - no more, and no less.
 *
 * Nobody's password passes through here. The browser is sent to Microsoft,
 * the person signs in there with whatever MFA their account requires, and
 * Microsoft returns a code. What we keep is a refresh token, encrypted.
 */

const TABLE = "microsoft_connections";

/** Holds the one-time state value while the person is away at Microsoft. */
export const STATE_COOKIE = "ms_oauth_state";
const AUTHORITY = "https://login.microsoftonline.com";

/**
 * What we ask each person for.
 *
 * Every scope here is one a person can consent to for themselves, so
 * connecting is genuinely "sign in and it works" - no approval request to
 * Microsoft, no tenant-wide grant, nothing to buy. They already pay for
 * these licences; this reads what the licence already gives them.
 *
 * `offline_access` is what makes the connection outlast the hour: without
 * a refresh token they would be reconnecting all day. The rest is
 * read-only on purpose - this shows what is already in Teams, so nothing
 * here can send, edit or delete.
 */
const SELF_CONSENT_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "User.Read",
  // 1:1 and group chats - including whatever the carrier connector posts
  // into them, which is where the texts show up.
  "Chat.Read",
  "Calendars.Read",
  // Their own presence. Presence.Read.All, for everybody's, is the
  // admin-consent version and deliberately not asked for.
  "Presence.Read",
];

/**
 * Messages in team channels, which Microsoft gates behind admin consent
 * even for delegated access - unlike chats, which it does not.
 *
 * Left out by default so that one person's curiosity about channels does
 * not turn every employee's connection into something an administrator has
 * to approve first. Set MS_INCLUDE_CHANNEL_MESSAGES=1 once consent has
 * been granted for the tenant.
 */
const ADMIN_CONSENT_SCOPES = ["ChannelMessage.Read.All"];

export const DELEGATED_SCOPES = [
  ...SELF_CONSENT_SCOPES,
  ...(process.env.MS_INCLUDE_CHANNEL_MESSAGES === "1" ? ADMIN_CONSENT_SCOPES : []),
].join(" ");

function config() {
  const tenant = process.env.MS_TICKETS_TENANT_ID;
  const clientId = process.env.MS_TICKETS_CLIENT_ID;
  const clientSecret = process.env.MS_TICKETS_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) throw new Error("not_configured");
  return { tenant, clientId, clientSecret };
}

export function isDelegatedConfigured(): boolean {
  return Boolean(
    process.env.MS_TICKETS_TENANT_ID &&
    process.env.MS_TICKETS_CLIENT_ID &&
    process.env.MS_TICKETS_CLIENT_SECRET,
  );
}

/**
 * Where Microsoft sends the person back to.
 *
 * Must match a redirect URI registered on the app, character for
 * character, including the scheme and any trailing path. Derived from the
 * request's own origin so that localhost, a preview deployment and
 * production each come back to themselves - every one of those has to be
 * registered in Entra.
 */
export function redirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/microsoft/callback`;
}

export function authorizeUrl(opts: { origin: string; state: string }): string {
  const { tenant, clientId } = config();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    response_mode: "query",
    redirect_uri: redirectUri(opts.origin),
    scope: DELEGATED_SCOPES,
    state: opts.state,
    // Always show the account picker. Several people here share a machine,
    // and silently reconnecting as whoever signed in last is how somebody
    // ends up reading a colleague's chats.
    prompt: "select_account",
  });
  return `${AUTHORITY}/${tenant}/oauth2/v2.0/authorize?${params}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { tenant } = config();
  const res = await fetch(`${AUTHORITY}/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || data.error) {
    // Microsoft's error_description carries the AADSTS code and the actual
    // reason - a missing redirect URI, an unconsented scope. Losing it
    // turns a five-minute fix in Entra into an afternoon.
    throw new Error(data.error_description?.split("\n")[0] ?? data.error ?? `Token request failed (${res.status})`);
  }
  return data;
}

/** The claims we care about from the id_token: who signed in. */
function whoSignedIn(idToken: string | undefined): { upn: string; name: string } {
  if (!idToken) return { upn: "", name: "" };
  try {
    const claims = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64").toString(),
    ) as Record<string, string>;
    return {
      upn: claims.preferred_username ?? claims.upn ?? claims.email ?? "",
      name: claims.name ?? "",
    };
  } catch {
    return { upn: "", name: "" };
  }
}

export interface MicrosoftConnection {
  email: string;
  microsoftUpn: string;
  displayName: string;
  scopes: string;
  connectedAt: string;
  lastUsedAt: string | null;
  brokenReason: string | null;
}

function toConnection(row: Record<string, unknown>): MicrosoftConnection {
  return {
    email: row.email as string,
    microsoftUpn: (row.microsoft_upn as string) ?? "",
    displayName: (row.display_name as string) ?? "",
    scopes: (row.scopes as string) ?? "",
    connectedAt: row.connected_at as string,
    lastUsedAt: (row.last_used_at as string) ?? null,
    brokenReason: (row.broken_reason as string) ?? null,
  };
}

/** Finishes the sign-in: code in, stored connection out. */
export async function completeConnection(opts: {
  email: string;
  code: string;
  origin: string;
}): Promise<MicrosoftConnection> {
  const { clientId, clientSecret } = config();
  const tokens = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: redirectUri(opts.origin),
    scope: DELEGATED_SCOPES,
  });

  if (!tokens.refresh_token) {
    // Without offline_access consented there is no refresh token, and the
    // connection would silently die in an hour. Better to refuse it now.
    throw new Error("Microsoft didn't return a refresh token — offline_access wasn't granted.");
  }

  const who = whoSignedIn(tokens.id_token);
  const row = {
    email: opts.email.toLowerCase(),
    microsoft_upn: who.upn,
    display_name: who.name,
    scopes: tokens.scope ?? "",
    refresh_token: encryptSecret(tokens.refresh_token) as unknown as Record<string, string>,
    connected_at: new Date().toISOString(),
    last_used_at: new Date().toISOString(),
    broken_reason: null,
  };

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from(TABLE).upsert(row).select().single();
  if (error) throw new Error(`Couldn't save the connection: ${error.message}`);
  return toConnection(data as Record<string, unknown>);
}

export async function getConnection(email: string): Promise<MicrosoftConnection | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from(TABLE).select("*").eq("email", email.toLowerCase()).maybeSingle();
  return data ? toConnection(data as Record<string, unknown>) : null;
}

export async function disconnect(email: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from(TABLE).delete().eq("email", email.toLowerCase());
}

/**
 * An access token for this person, good for about an hour.
 *
 * Access tokens are not stored: they expire quickly and a refresh costs one
 * round trip, so keeping them would add a cache to invalidate and a second
 * credential at rest for no benefit. The refresh token is rotated by
 * Microsoft on every use and the new one is written back.
 */
export async function accessTokenFor(email: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from(TABLE)
    .select("email, refresh_token")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (!data) throw new Error("not_connected");

  const { clientId, clientSecret } = config();
  const stored = decryptSecret((data as { refresh_token: EncryptedSecret }).refresh_token);

  let tokens: TokenResponse;
  try {
    tokens = await tokenRequest({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: stored,
      scope: DELEGATED_SCOPES,
    });
  } catch (err) {
    // A refresh token dies when the person changes their password, an
    // admin revokes sessions, or consent is withdrawn. Record why, so the
    // UI can ask them to reconnect rather than showing an empty page.
    const reason = err instanceof Error ? err.message : "Refresh failed";
    await supabase.from(TABLE).update({ broken_reason: reason }).eq("email", email.toLowerCase());
    throw new Error(reason);
  }

  const update: Record<string, unknown> = {
    last_used_at: new Date().toISOString(),
    broken_reason: null,
  };
  // Microsoft rotates it; missing it would mean the connection stops
  // working whenever the old one is retired.
  if (tokens.refresh_token) {
    update.refresh_token = encryptSecret(tokens.refresh_token);
  }
  await supabase.from(TABLE).update(update).eq("email", email.toLowerCase());

  if (!tokens.access_token) throw new Error("Microsoft returned no access token");
  return tokens.access_token;
}

/** A Graph call as this person. Relative path, e.g. "/me/chats?$top=20". */
export async function graphAs<T>(email: string, path: string): Promise<T> {
  const token = await accessTokenFor(email);
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    const detail = (() => {
      try { return (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? ""; }
      catch { return text.slice(0, 200); }
    })();
    throw new Error(`Graph ${path.split("?")[0]} ${res.status}: ${detail}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}
