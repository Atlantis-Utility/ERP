import { createHash } from "node:crypto";
import { withCache, invalidate } from "./server-cache";
export { invalidate as invalidateGdmsCache };

// GDMS (Grandstream Device Management System) OpenAPI.
// Spec: https://doc.grandstream.dev/GDMS-API/EN/ (the apidoc JSON at
// .../api_data.json is the authoritative source — the PDF guides lag behind it
// and the community PHP SDK gets site/list's verb wrong).
//
// Two things make this API unusual:
//   1. The login password is pre-hashed by the client as sha256(md5(password)).
//   2. Every non-token request carries a `signature` derived from the request's
//      own parameters plus the client secret — see sign() below.
const API_ID     = process.env.GDMS_API_ID?.trim();
const SECRET_KEY = process.env.GDMS_SECRET_KEY?.trim();
const USERNAME   = process.env.GDMS_USERNAME?.trim();
const PASSWORD   = process.env.GDMS_PASSWORD?.trim();
const DOMAIN     = process.env.GDMS_DOMAIN?.trim() || "www.gdms.cloud";

const API_VERSION = "1.0.0";
const GDMS_TTL = 3 * 60_000; // 3 minutes, matching the RingLogix read cache
const PAGE_SIZE = 1000;      // the API's own default and documented maximum
const MAX_PAGES = 50;        // guard against a runaway pagination loop

export function isConfigured(): boolean {
  return Boolean(API_ID && SECRET_KEY && USERNAME && PASSWORD);
}

// Which env vars are absent, so the UI can name them instead of just saying
// "not configured". API_ID/SECRET_KEY alone are not enough — the token
// endpoint is an OAuth2 *password* grant and needs the account login too.
export function missingConfig(): string[] {
  return [
    ["GDMS_API_ID", API_ID],
    ["GDMS_SECRET_KEY", SECRET_KEY],
    ["GDMS_USERNAME", USERNAME],
    ["GDMS_PASSWORD", PASSWORD],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k as string);
}

export function baseUrl(): string {
  return `https://${DOMAIN}/oapi`;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface GdmsOrganization {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
}

export interface GdmsSite {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  organizationId: string;
  /** Sites nest arbitrarily deep in GDMS; this is the parent's id, if any. */
  parentId: string | null;
}

export type GdmsDeviceStatus = "online" | "offline" | "abnormal" | "unknown";
export type GdmsAccountStatus = "none" | "normal" | "abnormal" | "unknown";

export interface GdmsDevice {
  /** GDMS has no surrogate device id — MAC is the identifier every endpoint takes. */
  mac: string;
  sn: string;
  name: string;
  /** GDMS calls this `deviceType`, but it holds the model (e.g. "HT802"). */
  model: string;
  status: GdmsDeviceStatus;
  accountStatus: GdmsAccountStatus;
  dnd: boolean;
  siteId: string;
  siteName: string;
  organizationId: string;
  publicIp: string;
  privateIp: string;
  firmwareVersion: string;
  /**
   * Last config time as the API prints it ("2026-06-12 18:13", account-local,
   * no timezone), or null if never configured. The apidoc claims epoch ms; the
   * live API returns this string, so it is passed through rather than parsed
   * into a Date that would silently assume a timezone.
   */
  lastConfigTime: string | null;
  isSynchronized: boolean;
  syncFailureMsg: string | null;
  hasScheduledTask: boolean;
}

// ── Hashing / signing ──────────────────────────────────────────────────────

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const md5    = (s: string) => createHash("md5").update(s, "utf8").digest("hex");

// The token endpoint never sees the plaintext password: it expects
// sha256(md5(password)), lowercase hex at both steps.
const encodePassword = (pw: string) => sha256(md5(pw));

// signature = sha256( "&" + sorted("key=value" joined by "&") + "&" [+ sha256(body) + "&"] )
//
// The sorted set is every URL query parameter plus the four common parameters
// access_token, client_id, client_secret and timestamp. client_id/client_secret
// participate in the hash but are deliberately NOT sent on the wire — that is
// what makes the signature prove possession of the secret.
function sign(
  accessToken: string,
  timestamp: number,
  query: Record<string, string>,
  body: string,
): string {
  const all: Record<string, string> = {
    ...query,
    access_token:  accessToken,
    client_id:     API_ID!,
    client_secret: SECRET_KEY!,
    timestamp:     String(timestamp),
  };
  const joined = Object.keys(all)
    .sort()
    .map((k) => `${k}=${all[k]}`)
    .join("&");
  return sha256(body.length > 0 ? `&${joined}&${sha256(body)}&` : `&${joined}&`);
}

// ── Token handling ─────────────────────────────────────────────────────────

interface GdmsToken {
  value: string;
  expiresAt: number;
  refreshToken: string;
}

let cachedToken: GdmsToken | null = null;
// Dedupes concurrent logins — without this, a cold page load firing several
// requests at once would burn one password grant per request.
let tokenInFlight: Promise<GdmsToken> | null = null;

async function fetchToken(form: Record<string, string>): Promise<GdmsToken> {
  const body = new URLSearchParams(form);

  // The apidoc documents GET here, but the endpoint accepts an
  // x-www-form-urlencoded POST identically and that keeps the (hashed)
  // password and client_secret out of URLs and any intermediary access log.
  const res = await fetch(`https://${DOMAIN}/oapi/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`GDMS auth returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok || typeof data.access_token !== "string") {
    // Failures come back as {error, error_description}. The two worth
    // telling apart: invalid_client = bad GDMS_API_ID/GDMS_SECRET_KEY,
    // invalid_grant = bad GDMS_USERNAME/GDMS_PASSWORD.
    const code = typeof data.error === "string" ? data.error : `http_${res.status}`;
    const desc = typeof data.error_description === "string" ? data.error_description : "";
    throw new Error(`GDMS auth failed (${code})${desc ? `: ${desc}` : ""}`);
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  return {
    value: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : "",
  };
}

async function login(): Promise<GdmsToken> {
  // Try the cheaper refresh grant first when we have one.
  if (cachedToken?.refreshToken) {
    try {
      return await fetchToken({
        grant_type:    "refresh_token",
        refresh_token: cachedToken.refreshToken,
        client_id:     API_ID!,
        client_secret: SECRET_KEY!,
      });
    } catch {
      cachedToken = null; // fall through to a full password grant
    }
  }

  return fetchToken({
    grant_type:    "password",
    username:      USERNAME!,
    password:      encodePassword(PASSWORD!),
    client_id:     API_ID!,
    client_secret: SECRET_KEY!,
  });
}

async function getToken(): Promise<string> {
  if (!isConfigured()) {
    throw new Error(`GDMS_NOT_CONFIGURED: missing ${missingConfig().join(", ")}`);
  }

  // 60s buffer so a token can't expire mid-flight.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  if (!tokenInFlight) {
    tokenInFlight = login()
      .then((t) => {
        cachedToken = t;
        return t;
      })
      .finally(() => {
        tokenInFlight = null;
      });
  }

  return (await tokenInFlight).value;
}

// ── Request plumbing ───────────────────────────────────────────────────────

interface GdmsEnvelope<T> {
  data?: T;
  msg?: string;
  retCode?: number;
}

async function requestOnce<T>(
  path: string,
  method: "GET" | "POST",
  query: Record<string, string>,
  payload: unknown | undefined,
  accessToken: string,
): Promise<T> {
  const timestamp = Date.now();
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const signature = sign(accessToken, timestamp, query, body);

  const url = new URL(`https://${DOMAIN}/oapi/v${API_VERSION}/${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("signature", signature);
  url.searchParams.set("timestamp", String(timestamp));

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body.length > 0 ? body : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  if (res.status === 401) throw new Error("GDMS_TOKEN_REJECTED");

  let json: GdmsEnvelope<T>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`GDMS ${path} returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(`GDMS ${path} failed ${res.status}: ${json.msg || text.slice(0, 200)}`);
  }
  if (json.retCode !== 0) {
    throw new Error(
      `GDMS ${path} failed (retCode ${json.retCode}): ${json.msg || "no message"}`,
    );
  }
  if (json.data === undefined) {
    throw new Error(`GDMS ${path} succeeded but returned no data`);
  }

  return json.data;
}

async function request<T>(
  path: string,
  method: "GET" | "POST",
  opts: { query?: Record<string, string>; payload?: unknown } = {},
): Promise<T> {
  const query = opts.query ?? {};
  try {
    return await requestOnce<T>(path, method, query, opts.payload, await getToken());
  } catch (err) {
    // A token can be revoked server-side before its stated expiry. Drop it and
    // retry once with a fresh login rather than surfacing a spurious failure.
    if (err instanceof Error && err.message === "GDMS_TOKEN_REJECTED") {
      cachedToken = null;
      return requestOnce<T>(path, method, query, opts.payload, await getToken());
    }
    throw err;
  }
}

interface Paged<T> {
  result?: T[];
  total?: number;
  pages?: number;
}

// Walks every page of a paginated endpoint, always sending pageNum/pageSize
// explicitly.
//
// Do NOT "optimise" this by letting the first page use the server defaults: the
// documented default of 1000 is wrong (device/list actually defaults to 20,
// org/list to 200), and `pages` is relative to the page size used, so mixing a
// default-sized first page with explicitly-sized later pages silently drops
// rows — an account with 101 devices returned 20 of them that way.
async function fetchAllPages<T>(
  fetchPage: (pageNum: number, pageSize: number) => Promise<Paged<T>>,
): Promise<T[]> {
  const out: T[] = [];
  let pageNum = 1;
  let pages = 1;

  do {
    const page = await fetchPage(pageNum, PAGE_SIZE);
    out.push(...(page.result ?? []));
    pages = Math.min(page.pages ?? 1, MAX_PAGES);
    pageNum += 1;
  } while (pageNum <= pages);

  return out;
}

// ── Raw response shapes ────────────────────────────────────────────────────

interface RawOrg {
  id: number;
  organization?: string;
  description?: string;
  isDefault?: number;
}

interface RawSite {
  id: number;
  siteName?: string;
  description?: string;
  isDefault?: number;
  children?: RawSite[];
}

interface RawDevice {
  orgId?: number;
  deviceName?: string;
  deviceType?: string;
  mac?: string;
  sn?: string;
  publicIp?: string | null;
  privateip?: string | null;
  firmwareVersion?: string | null;
  lastTime?: string | number | null;
  status?: number;
  accountStatus?: number;
  dnd?: number;
  siteId?: number;
  siteName?: string;
  isSynchronized?: number;
  syncFailureMsg?: string | null;
  scheduledTask?: number;
}

function deviceStatusOf(v: number | undefined): GdmsDeviceStatus {
  switch (v) {
    case 1:  return "online";
    case 0:  return "offline";
    case -1: return "abnormal";
    default: return "unknown";
  }
}

function accountStatusOf(v: number | undefined): GdmsAccountStatus {
  switch (v) {
    case 1:  return "normal";
    case 0:  return "none";
    case -1: return "abnormal";
    default: return "unknown";
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/** All organizations visible to the account. GET, paginated. */
export async function getOrganizations(): Promise<GdmsOrganization[]> {
  return withCache(`gdms:orgs`, GDMS_TTL, async () => {
    const rows = await fetchAllPages<RawOrg>((pageNum, pageSize) =>
      request<Paged<RawOrg>>("org/list", "GET", {
        query: { pageNum: String(pageNum), pageSize: String(pageSize) },
      }),
    );
    return rows.map((o) => ({
      id: String(o.id),
      name: o.organization ?? "",
      description: o.description ?? "",
      isDefault: o.isDefault === 1,
    }));
  });
}

/**
 * Sites for one organization, flattened. GDMS returns these as a tree of
 * nested `children`, and omitting orgId returns only the default org's sites.
 */
export async function getSites(organizationId?: string): Promise<GdmsSite[]> {
  const key = `gdms:sites:${organizationId ?? "default"}`;
  return withCache(key, GDMS_TTL, async () => {
    const query: Record<string, string> = {};
    if (organizationId) query.orgId = organizationId;

    const data = await request<Paged<RawSite>>("site/list", "GET", { query });

    const out: GdmsSite[] = [];
    const walk = (nodes: RawSite[], parentId: string | null) => {
      for (const n of nodes) {
        const id = String(n.id);
        out.push({
          id,
          name: n.siteName ?? "",
          description: n.description ?? "",
          isDefault: n.isDefault === 1,
          organizationId: organizationId ?? "",
          parentId,
        });
        if (n.children?.length) walk(n.children, id);
      }
    };
    walk(data.result ?? [], null);
    return out;
  });
}

/**
 * Devices for one organization. POST, paginated. Each row already carries its
 * siteId/siteName, so there is no need to walk sites to enumerate devices.
 */
export async function getDevices(organizationId?: string): Promise<GdmsDevice[]> {
  const key = `gdms:devices:${organizationId ?? "default"}`;
  return withCache(key, GDMS_TTL, async () => {
    const rows = await fetchAllPages<RawDevice>((pageNum, pageSize) => {
      const payload: Record<string, unknown> = { pageNum, pageSize };
      if (organizationId) payload.orgId = Number(organizationId);
      return request<Paged<RawDevice>>("device/list", "POST", { payload });
    });

    return rows.map((d) => ({
      mac: d.mac ?? "",
      sn: d.sn ?? "",
      name: d.deviceName?.trim() || (d.mac ?? ""),
      model: d.deviceType ?? "",
      status: deviceStatusOf(d.status),
      accountStatus: accountStatusOf(d.accountStatus),
      dnd: d.dnd === 1,
      siteId: d.siteId === undefined ? "" : String(d.siteId),
      siteName: d.siteName ?? "",
      organizationId: d.orgId === undefined ? (organizationId ?? "") : String(d.orgId),
      publicIp: d.publicIp ?? "",
      privateIp: d.privateip ?? "",
      firmwareVersion: d.firmwareVersion ?? "",
      lastConfigTime: d.lastTime === undefined || d.lastTime === null ? null : String(d.lastTime),
      isSynchronized: d.isSynchronized === 1,
      syncFailureMsg: d.syncFailureMsg ?? null,
      hasScheduledTask: d.scheduledTask === 1,
    }));
  });
}

/**
 * Devices across every organization, de-duplicated by MAC. Organizations are
 * fetched first because device/list scopes to a single org (the default one
 * when orgId is omitted), so a single call would silently miss the rest.
 */
export async function getAllDevices(): Promise<GdmsDevice[]> {
  const orgs = await getOrganizations();
  if (orgs.length === 0) return getDevices();

  const byMac = new Map<string, GdmsDevice>();
  for (const org of orgs) {
    for (const d of await getDevices(org.id)) {
      if (d.mac) byMac.set(d.mac, d);
    }
  }
  return [...byMac.values()];
}
