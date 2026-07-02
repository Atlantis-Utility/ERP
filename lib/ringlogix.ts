import { withCache, invalidate } from "./server-cache";
export { invalidate as invalidateRinglogixCache };

const RINGLOGIX_API_BASE = "https://api.ringlogix.com/pbx/v1";
const API_ID     = process.env.RINGLOGIX_API_ID;
const API_SECRET = process.env.RINGLOGIX_API_SECRET;
const RL_USER    = process.env.RINGLOGIX_USERNAME;
const RL_PASS    = process.env.RINGLOGIX_PASSWORD;

export function isConfigured(): boolean {
  return Boolean(API_ID && API_SECRET && RL_USER && RL_PASS);
}

// In-memory token cache (per server process)
let cachedToken: { value: string; type: string; expiresAt: number; refreshToken: string } | null = null;

async function fetchToken(body: Record<string, string>): Promise<typeof cachedToken> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) params.append(k, v);

  const res = await fetch(`${RINGLOGIX_API_BASE}/oauth2/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RingLogix auth failed ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const expiresIn: number = data.expires_in ?? 3600;

  return {
    value: data.access_token,
    type: data.token_type ?? "Bearer",
    expiresAt: Date.now() + expiresIn * 1000,
    refreshToken: data.refresh_token ?? "",
  };
}

async function getToken(): Promise<{ token: string; type: string }> {
  const now = Date.now();

  // Use cached token if still valid (60s buffer)
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return { token: cachedToken.value, type: cachedToken.type };
  }

  // Try refresh token first if we have one
  if (cachedToken?.refreshToken) {
    try {
      cachedToken = await fetchToken({
        grant_type: "refresh_token",
        client_id: API_ID!,
        client_secret: API_SECRET!,
        refresh_token: cachedToken.refreshToken,
        scope: "office_manager",
      });
      return { token: cachedToken.value, type: cachedToken.type };
    } catch {
      cachedToken = null;
    }
  }

  // Full password grant
  cachedToken = await fetchToken({
    grant_type: "password",
    client_id: API_ID!,
    client_secret: API_SECRET!,
    username: RL_USER!,
    password: RL_PASS!,
    scope: "office_manager",
  });

  return { token: cachedToken.value, type: cachedToken.type };
}

const READ_ACTIONS = new Set(["read", "list"]);
const RL_TTL = 3 * 60_000; // 3 minutes for read-only data

async function pbxApiRaw(
  object: string,
  action: string,
  params: Record<string, string> = {},
) {
  if (!isConfigured()) throw new Error("RINGLOGIX_NOT_CONFIGURED");

  const { token, type } = await getToken();

  const url = `${RINGLOGIX_API_BASE}/?object=${encodeURIComponent(object)}&action=${encodeURIComponent(action)}`;

  const form = new FormData();
  form.append("format", "json");
  for (const [k, v] of Object.entries(params)) form.append(k, v);

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `${type} ${token}` },
    body: form,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RingLogix ${object}/${action} ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json();
}

function pbxApi(
  object: string,
  action: string,
  params: Record<string, string> = {},
) {
  const doFetch = () => pbxApiRaw(object, action, params);
  if (!READ_ACTIONS.has(action)) return doFetch();
  // Stable cache key from sorted params
  const paramStr = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return withCache(`rl:${object}:${action}:${paramStr}`, RL_TTL, doFetch);
}

// Domains = customer accounts in reseller context
export async function getCustomers() {
  return pbxApi("domain", "read");
}

export async function getCustomer(domain: string) {
  return pbxApi("domain", "read", { domain });
}

// Phone numbers / DIDs
export async function getDIDs(domain?: string) {
  const params: Record<string, string> = {};
  if (domain) params.domain = domain;
  return pbxApi("smsnumber", "read", params);
}

// Call records (CDRs)
export async function getCDRs(opts?: {
  domain?: string;
  limit?: string;
  startDate?: string;
  endDate?: string;
}) {
  const params: Record<string, string> = {};
  if (opts?.domain)    params.domain     = opts.domain;
  if (opts?.limit)     params.limit      = opts.limit;
  if (opts?.startDate) params.start_time = opts.startDate;
  if (opts?.endDate)   params.end_time   = opts.endDate;
  return pbxApi("cdr2", "read", params);
}

// Reseller client billing
export async function getBilling(domain?: string) {
  const params: Record<string, string> = {};
  if (domain) params.domain = domain;
  return pbxApi("reseller_client", "read", params);
}

// Subscribers / extensions
export async function getSubscribers(domain?: string) {
  const params: Record<string, string> = {};
  if (domain) params.domain = domain;
  return pbxApi("subscriber", "read", params);
}

// SIP devices / registered phones
export async function getDevices(domain?: string) {
  const params: Record<string, string> = {};
  if (domain) params.domain = domain;
  return pbxApi("device", "read", params);
}

// Call queues
export async function getQueues(domain?: string) {
  const params: Record<string, string> = {};
  if (domain) params.domain = domain;
  return pbxApi("callqueue", "read", params);
}

// Conference rooms
export async function getConferences(domain?: string) {
  const params: Record<string, string> = {};
  if (domain) params.domain = domain;
  return pbxApi("conference", "read", params);
}

// Call recordings
export async function getRecordings(opts?: { domain?: string; limit?: string }) {
  const params: Record<string, string> = {};
  if (opts?.domain) params.domain = opts.domain;
  if (opts?.limit)  params.limit  = opts.limit;
  return pbxApi("recording", "read", params);
}

// Territories (reseller regions)
export async function getTerritories() {
  return pbxApi("territory", "read");
}

// Dial plans
export async function getDialplans(domain?: string) {
  const params: Record<string, string> = {};
  if (domain) params.domain = domain;
  return pbxApi("dialplan", "read", params);
}

// Contacts
export async function getContacts(domain: string, user: string, opts?: { first_name?: string; last_name?: string; limit?: string }) {
  const params: Record<string, string> = { domain, user };
  if (opts?.first_name) params.first_name = opts.first_name;
  if (opts?.last_name)  params.last_name  = opts.last_name;
  if (opts?.limit)      params.limit      = opts.limit;
  return pbxApi("contact", "read", params);
}

export async function createContact(domain: string, user: string, firstName: string, lastName: string, opts?: { home_phone?: string; cell_phone?: string; work_phone?: string; email?: string; company?: string }) {
  const params: Record<string, string> = { domain, user, first_name: firstName, last_name: lastName };
  if (opts?.company)    params.company    = opts.company;
  if (opts?.work_phone) params.work_phone = opts.work_phone;
  if (opts?.cell_phone) params.cell_phone = opts.cell_phone;
  if (opts?.home_phone) params.home_phone = opts.home_phone;
  if (opts?.email)      params.email      = opts.email;
  return pbxApi("contact", "create", params);
}

export async function deleteContact(domain: string, user: string, firstName: string, lastName: string, contactId: string) {
  return pbxApi("contact", "delete", { domain, user, first_name: firstName, last_name: lastName, contact_id: contactId });
}

// Departments
export async function getDepartments(domain: string) {
  return pbxApi("department", "list", { domain });
}

// Device Models
export async function getDeviceModels(opts?: { brand?: string; model?: string }) {
  const params: Record<string, string> = {};
  if (opts?.brand) params.brand = opts.brand;
  if (opts?.model) params.model = opts.model;
  return pbxApi("devicemodel", "read", params);
}

// Call Requests / Wake-Up Calls
export async function getCallRequests(opts?: { domain?: string; user?: string }) {
  const params: Record<string, string> = {};
  if (opts?.domain) params.domain = opts.domain;
  if (opts?.user)   params.user   = opts.user;
  return pbxApi("callrequest", "read", params);
}

export async function addWakeUpCall(uid: string, opts: { timeToCall?: string; dDay?: string; dHour?: string; dMin?: string }) {
  const params: Record<string, string> = { uid };
  if (opts.timeToCall) params.timeToCall = opts.timeToCall;
  if (opts.dDay)       params.dDay       = opts.dDay;
  if (opts.dHour)      params.dHour      = opts.dHour;
  if (opts.dMin)       params.dMin       = opts.dMin;
  return pbxApi("callrequest", "addWakeUp", params);
}

export async function deleteWakeUpCall(uid: string, requestId?: string) {
  const params: Record<string, string> = { uid };
  if (requestId) params.requestId = requestId;
  return pbxApi("callrequest", "delWakeUp", params);
}

// Dial Rules
export async function getDialRules(domain: string, dialplan: string) {
  return pbxApi("dialrule", "read", { domain, dialplan });
}

export async function createDialRule(domain: string, dialplan: string, matchrule: string, toUser: string) {
  return pbxApi("dialrule", "create", { domain, dialplan, matchrule, to_user: toUser });
}
