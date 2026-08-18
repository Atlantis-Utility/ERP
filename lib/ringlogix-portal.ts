import { withCache } from "./server-cache";

// RingLogix's reseller "Customer Dashboard" (the one showing multiple customer
// accounts with balances) lives on a separate ASP.NET portal from the documented
// pbx/v1 REST API, with its own session-cookie login — not the OAuth flow in
// ringlogix.ts. This scrapes that portal's internal AJAX endpoint since RingLogix
// does not expose reseller-wide customer listing via the public API.
const PORTAL_BASE = "https://atlantisutility.simplelogin.net";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const RL_USER = process.env.RINGLOGIX_USERNAME?.trim();
const RL_PASS = process.env.RINGLOGIX_PASSWORD?.trim();
const FETCH_TIMEOUT_MS = 15_000;

export function isPortalConfigured(): boolean {
  return Boolean(RL_USER && RL_PASS);
}

interface PortalSession {
  cookie: string;
  obtainedAt: number;
}

let cachedSession: PortalSession | null = null;
let loginInFlight: Promise<string> | null = null;
const SESSION_TTL = 10 * 60_000;

function mergeCookies(map: Record<string, string>, setCookies: string[]) {
  for (const c of setCookies) {
    const eq = c.indexOf("=");
    const semi = c.indexOf(";");
    if (eq === -1) continue;
    const key = c.slice(0, eq);
    const value = c.slice(eq + 1, semi === -1 ? undefined : semi);
    map[key] = value;
  }
}

function cookieHeaderOf(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function loginToPortal(): Promise<string> {
  if (!isPortalConfigured()) throw new Error("RINGLOGIX_PORTAL_NOT_CONFIGURED");

  const cookieMap: Record<string, string> = {};

  const homeRes = await fetch(`${PORTAL_BASE}/`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  mergeCookies(cookieMap, homeRes.headers.getSetCookie?.() ?? []);
  const html = await homeRes.text();

  const tokenMatch = html.match(/name="__RequestVerificationToken" type="hidden" value="([^"]+)"/);
  if (!tokenMatch) throw new Error("RingLogix portal: login form token not found");

  const body = new URLSearchParams({
    __RequestVerificationToken: tokenMatch[1],
    Username: RL_USER!,
    Password: RL_PASS!,
  });

  const loginRes = await fetch(`${PORTAL_BASE}/Home/LoginView`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeaderOf(cookieMap),
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": USER_AGENT,
      Referer: `${PORTAL_BASE}/`,
    },
    body: body.toString(),
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  mergeCookies(cookieMap, loginRes.headers.getSetCookie?.() ?? []);
  if (loginRes.status !== 302) {
    throw new Error(`RingLogix portal login failed: ${loginRes.status}`);
  }

  // The customer-list endpoint 500s unless the dashboard page is loaded first
  // in the same session (it appears to prime some server-side session state).
  const dashRes = await fetch(`${PORTAL_BASE}/Dashboard/CustomerDashboard`, {
    headers: { Cookie: cookieHeaderOf(cookieMap), "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  mergeCookies(cookieMap, dashRes.headers.getSetCookie?.() ?? []);
  await dashRes.text();

  return cookieHeaderOf(cookieMap);
}

async function getPortalSession(forceFresh = false): Promise<string> {
  const now = Date.now();
  if (!forceFresh && cachedSession && now - cachedSession.obtainedAt < SESSION_TTL) {
    return cachedSession.cookie;
  }

  // Dedupe concurrent callers so a burst of requests (e.g. several page loads
  // right as the cached session expires) doesn't fire off parallel logins
  // against the portal.
  if (!loginInFlight) {
    loginInFlight = loginToPortal()
      .then((cookie) => {
        cachedSession = { cookie, obtainedAt: Date.now() };
        return cookie;
      })
      .finally(() => {
        loginInFlight = null;
      });
  }
  return loginInFlight;
}

function decodeCellText(cellHtml: string): string {
  return cellHtml
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export interface PortalCustomer {
  id: string;
  parentId: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  status: string;
  balance: string;
  creditLimit: string;
}

function parseCustomerRows(tbodyHtml: string): PortalCustomer[] {
  const rows: PortalCustomer[] = [];
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(tbodyHtml))) {
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) cells.push(cellMatch[1]);
    if (cells.length < 7) continue;

    const linkMatch = cells[0].match(/fnGetCustomerDetails\('([^']*)','([^']*)'/);
    rows.push({
      id: linkMatch?.[1] ?? "",
      parentId: linkMatch?.[2] ?? "",
      company: decodeCellText(cells[0]),
      contact: decodeCellText(cells[1]),
      email: decodeCellText(cells[2]),
      phone: decodeCellText(cells[3]),
      status: decodeCellText(cells[4]),
      balance: decodeCellText(cells[5]),
      creditLimit: decodeCellText(cells[6]),
    });
  }
  return rows;
}

// The portal groups customers into a variable number of <tbody> blocks (open,
// suspended, terminated, ...) — previously this only read the first two
// ("tbodyCustomerList" / "tbodyCustomerList2") which silently dropped any
// further status groups. Scan for all of them instead, and dedupe by id in
// case a row appears in more than one group.
function parseAllCustomerTables(html: string): PortalCustomer[] {
  const rows: PortalCustomer[] = [];
  const seen = new Set<string>();
  const tbodyRegex = /<tbody id="(tbodyCustomerList\w*)"[^>]*>([\s\S]*?)<\/tbody>/g;
  let tbodyMatch: RegExpExecArray | null;
  while ((tbodyMatch = tbodyRegex.exec(html))) {
    for (const row of parseCustomerRows(tbodyMatch[2])) {
      const key = `${row.id}:${row.parentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

async function fetchCustomerListHtml(cookie: string): Promise<Response> {
  return fetch(`${PORTAL_BASE}/Dashboard/GetCustomerList`, {
    headers: {
      Cookie: cookie,
      "X-Requested-With": "XMLHttpRequest",
      accept: "*/*",
      "User-Agent": USER_AGENT,
      Referer: `${PORTAL_BASE}/Dashboard/CustomerDashboard`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

async function fetchPortalCustomersRaw(): Promise<PortalCustomer[]> {
  let res: Response;
  try {
    res = await fetchCustomerListHtml(await getPortalSession());
  } catch {
    res = await fetchCustomerListHtml(await getPortalSession(true));
  }

  if (!res.ok) {
    // Session may have expired server-side (or was never valid) — retry once with a fresh login.
    try {
      res = await fetchCustomerListHtml(await getPortalSession(true));
    } catch (err) {
      throw new Error(`RingLogix portal customer list failed: ${err instanceof Error ? err.message : "network error"}`);
    }
  }

  if (!res.ok) {
    throw new Error(`RingLogix portal customer list failed: ${res.status}`);
  }

  const html = await res.text();
  return parseAllCustomerTables(html);
}

const PORTAL_TTL = 10 * 60_000;

export function getPortalCustomers(): Promise<PortalCustomer[]> {
  return withCache("rl:portal:customers", PORTAL_TTL, fetchPortalCustomersRaw);
}

// Bypasses the in-memory cache entirely — used by the cron sync route so
// each run reflects the portal's current state, not a stale cached copy.
export function fetchFreshPortalCustomers(): Promise<PortalCustomer[]> {
  return fetchPortalCustomersRaw();
}
