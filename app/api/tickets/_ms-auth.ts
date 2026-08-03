const TICKET_MAILBOX = "ticket@atlantisutility.com";

let cachedGraphToken: { value: string; expiresAt: number } | null = null;

export async function getGraphToken(): Promise<string> {
  const tenantId     = process.env.MS_TICKETS_TENANT_ID;
  const clientId     = process.env.MS_TICKETS_CLIENT_ID;
  const clientSecret = process.env.MS_TICKETS_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) throw new Error("not_configured");

  if (cachedGraphToken && cachedGraphToken.expiresAt > Date.now() + 60_000) {
    return cachedGraphToken.value;
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "client_credentials",
      client_id:     clientId,
      client_secret: clientSecret,
      scope:         "https://graph.microsoft.com/.default",
    }),
    cache: "no-store",
  });
  const data = await res.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error(`OAuth failed: ${JSON.stringify(data)}`);

  cachedGraphToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

export const TICKET_MAILBOX_ENCODED = encodeURIComponent(TICKET_MAILBOX);
