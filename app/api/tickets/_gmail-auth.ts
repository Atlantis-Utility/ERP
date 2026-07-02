import { createSign } from "crypto";

const GMAIL_USER = "ticket@atlantisutility.com";

export function buildJwt(clientEmail: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss:   clientEmail,
    sub:   GMAIL_USER,
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
  })).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(unsigned);
  return `${unsigned}.${signer.sign(privateKey.replace(/\\n/g, "\n"), "base64url")}`;
}

let cachedGmailToken: { value: string; expiresAt: number } | null = null;

export async function getGmailToken(): Promise<string> {
  const clientEmail = process.env.GMAIL_CLIENT_EMAIL;
  const privateKey  = process.env.GMAIL_PRIVATE_KEY;
  if (!clientEmail || !privateKey) throw new Error("not_configured");

  if (cachedGmailToken && cachedGmailToken.expiresAt > Date.now() + 60_000) {
    return cachedGmailToken.value;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  buildJwt(clientEmail, privateKey),
    }),
    cache: "no-store",
  });
  const data = await res.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error(`OAuth failed: ${JSON.stringify(data)}`);

  cachedGmailToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

export const GMAIL_ENCODED = "ticket%40atlantisutility.com";
