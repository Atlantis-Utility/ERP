import { NextResponse } from "next/server";

export async function GET() {
  const client_id     = process.env.RINGLOGIX_API_ID!;
  const client_secret = process.env.RINGLOGIX_API_SECRET!;
  const username      = process.env.RINGLOGIX_USERNAME!;
  const password      = process.env.RINGLOGIX_PASSWORD!;

  const results: Record<string, unknown> = {};

  async function probe(label: string, url: string, opts: RequestInit = {}) {
    try {
      const r = await fetch(url, { cache: "no-store", redirect: "follow", ...opts });
      const text = await r.text().catch(() => "");
      results[label] = { status: r.status, ct: r.headers.get("content-type"), body: text.slice(0, 500) || "(empty)" };
    } catch (e) {
      results[label] = { error: String(e) };
    }
  }

  const tokenBody = new URLSearchParams({ grant_type: "password", client_id, client_secret, username, password }).toString();
  const tokenOpts: RequestInit = { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: tokenBody };

  // Check if atlantisutility.com domain hosts an NS-API
  await probe("1_atlantis_root",        "https://atlantisutility.com/");
  await probe("2_atlantis_nsapi",       "https://atlantisutility.com/ns-api/");
  await probe("3_atlantis_token",       "https://atlantisutility.com/ns-api/oauth2/token/", tokenOpts);
  await probe("4_portal_atlantis",      "https://portal.atlantisutility.com/");
  await probe("5_portal_atlantis_ns",   "https://portal.atlantisutility.com/ns-api/oauth2/token/", tokenOpts);
  await probe("6_pbx_atlantis",         "https://pbx.atlantisutility.com/");
  await probe("7_my_atlantis",          "https://my.atlantisutility.com/ns-api/oauth2/token/", tokenOpts);

  // Try pbx.ringlogix.com token with Accept: application/json
  await probe("8_pbx_with_accept", "https://pbx.ringlogix.com/ns-api/oauth2/token/", {
    ...tokenOpts,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
  });

  // Try GET to pbx.ringlogix.com token endpoint (see what it says without creds)
  await probe("9_pbx_token_GET", "https://pbx.ringlogix.com/ns-api/oauth2/token/");

  // Try pbx.ringlogix.com NS-API with just uid/password (no client_id)
  await probe("10_pbx_uid_only", "https://pbx.ringlogix.com/ns-api/?format=json&object=domain&action=read", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ uid: username, secret: password, format: "json", object: "domain", action: "read" }).toString(),
  });

  return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
}
