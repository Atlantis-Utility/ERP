/**
 * Signing in with Zoho.
 *
 * Supabase has no Zoho provider (its list is Microsoft, Google, Apple,
 * GitHub and friends), so this is the OAuth round trip written out: send
 * the person to Zoho, take the code back, ask Zoho who they are, and only
 * then mint a Supabase session for the matching employee.
 *
 * Zoho runs separate data centres and the accounts host differs per region
 * (.com, .eu, .in, .com.au, .jp). ZOHO_ACCOUNTS_DOMAIN covers that; the
 * default is the US one.
 */

export const ZOHO_STATE_COOKIE = "zoho_oauth_state";

const ACCOUNTS = (process.env.ZOHO_ACCOUNTS_DOMAIN ?? "accounts.zoho.com").replace(/^https?:\/\//, "");

/**
 * Where Zoho sends people back to, which has to match what's registered in
 * the API console character for character: scheme, host, port, path, no
 * trailing slash. Overridable because a console that will only hold one
 * URI, or a deployment on a domain we can't guess, both need the app to
 * send something other than "this request's origin".
 */
export function zohoRedirectUri(origin: string): string {
  const explicit = process.env.ZOHO_REDIRECT_URI?.trim();
  return explicit || `${origin}/api/auth/zoho/callback`;
}

export function zohoConfigured(): boolean {
  return Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET);
}

export function zohoAuthorizeUrl(opts: { redirectUri: string; state: string }): string {
  const url = new URL(`https://${ACCOUNTS}/oauth/v2/auth`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.ZOHO_CLIENT_ID!);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  // Just enough to learn who signed in. No mail, files or calendar scopes:
  // this is authentication, and asking for more would put a frightening
  // consent screen in front of it for no gain.
  url.searchParams.set("scope", "AaaServer.profile.READ");
  url.searchParams.set("access_type", "online");
  return url.toString();
}

export interface ZohoIdentity {
  email: string;
  displayName: string | null;
}

/** Trades the code for a token and asks Zoho whose account it is. */
export async function zohoIdentityFromCode(opts: {
  code: string;
  redirectUri: string;
}): Promise<ZohoIdentity> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    redirect_uri: opts.redirectUri,
    code: opts.code,
  });

  const tokenRes = await fetch(`https://${ACCOUNTS}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  const token = (await tokenRes.json()) as { access_token?: string; error?: string };
  // Zoho answers a rejected exchange with HTTP 200 and an `error` key, so
  // the status alone doesn't tell you whether this worked.
  if (!tokenRes.ok || !token.access_token) {
    throw new Error(`zoho token exchange failed: ${token.error ?? tokenRes.status}`);
  }

  const infoRes = await fetch(`https://${ACCOUNTS}/oauth/user/info`, {
    headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` },
    cache: "no-store",
  });
  if (!infoRes.ok) throw new Error(`zoho user info failed: ${infoRes.status}`);
  const info = (await infoRes.json()) as {
    Email?: string;
    Display_Name?: string;
    First_Name?: string;
    Last_Name?: string;
  };

  const email = (info.Email ?? "").trim().toLowerCase();
  if (!email) throw new Error("zoho user info carried no email");

  return {
    email,
    displayName:
      info.Display_Name?.trim() ||
      [info.First_Name, info.Last_Name].filter(Boolean).join(" ").trim() ||
      null,
  };
}
