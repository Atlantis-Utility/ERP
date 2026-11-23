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

/**
 * Our own PBX domain - the one Atlantis's extensions and SMS numbers live
 * on, as opposed to a customer's.
 *
 * Read from the API user's own name (`api@277215`), which is where it is
 * least likely to drift: an account that moves domains brings its username
 * with it. The client id carries the same number in its `c<domain>`
 * segment, which is the fallback.
 */
export function ourDomain(): string {
  const fromUser = (RL_USER ?? "").split("@")[1]?.trim();
  if (fromUser) return fromUser;
  return (API_ID ?? "").match(/-c(\d+)/)?.[1] ?? "";
}

type RLToken = { value: string; type: string; expiresAt: number; refreshToken: string };

// In-memory token cache (per server process)
let cachedToken: RLToken | null = null;

async function fetchToken(body: Record<string, string>): Promise<RLToken> {
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
    // The token endpoint answers failures with an empty body and puts the
    // actual reason in a "Warning" header — "Invalid User Login" when the
    // user lacks API access, "Invalid_client [OA051]" for a bad
    // client_id/secret. Without it every failure reads as a bare 403.
    const reason = res.headers.get("warning") ?? text.slice(0, 300);
    throw new Error(`RingLogix auth failed ${res.status}: ${reason || "no reason given"}`);
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

/**
 * The Authorization header the API expects, for the one case that needs
 * to fetch a RingLogix URL directly rather than through pbxApi: an
 * attachment, which lives behind its own token-protected address.
 */
export async function ringlogixAuthHeader(): Promise<string> {
  const { token, type } = await getToken();
  return `${type} ${token}`;
}

/**
 * A refusal from the RingLogix API, with the reason it actually gave.
 *
 * `denied` separates "we are not allowed to ask this" from "the request
 * went wrong". It is the difference between a Retry button that might work
 * and one that cannot: an account whose scope has been changed will answer
 * 401 "Invalid Scope [APP001]" to every object, for as long as it takes
 * somebody to put the scope back in the RingLogix portal.
 *
 * 401 and 403 both mean permissions here, despite what the numbers usually
 * say. The token is fine - it is issued, it just carries whatever scope the
 * API user holds - and 403 is how a single object is blocked for an account
 * that otherwise works.
 */
export class RingLogixError extends Error {
  readonly object: string;
  readonly action: string;
  readonly status: number;
  /** What the Warning header said, e.g. "Invalid Scope [APP001]". */
  readonly reason: string;
  readonly denied: boolean;

  constructor(object: string, action: string, status: number, reason: string) {
    super(`RingLogix ${object}/${action} ${status}: ${reason || "no reason given"}`);
    this.name = "RingLogixError";
    this.object = object;
    this.action = action;
    this.status = status;
    this.reason = reason;
    this.denied = status === 401 || status === 403;
  }
}

const READ_ACTIONS = new Set(["read", "list"]);
const RL_TTL = 3 * 60_000; // 3 minutes for read-only data

/**
 * Messages are the exception to the three-minute cache.
 *
 * Everything else here - numbers, devices, subscribers - changes when
 * somebody provisions something, so three minutes is generous. A text
 * arrives whenever the customer decides to send one, and a message list
 * served from a three-minute cache cannot be polled: the page would ask
 * every ten seconds and be told the same thing for three minutes.
 *
 * Short enough to feel live, long enough that ten people watching the
 * inbox is still a handful of calls a minute rather than sixty.
 */
const RL_MESSAGE_TTL = 5_000;
const LIVE_OBJECTS = new Set(["messagesession", "message"]);

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
    // Same trick as the token endpoint: the body is empty and the reason is
    // in a "Warning" header. Without reading it, every refusal arrives as a
    // bare "401: " and the next person has no idea the API user's scope was
    // changed out from under them.
    const reason = res.headers.get("warning") ?? text.slice(0, 300);
    throw new RingLogixError(object, action, res.status, reason);
  }

  // An accepted write answers 202 with no body at all - messagesession's
  // update does, and so does a media send. res.json() on an empty body
  // throws "Unexpected end of JSON input", which surfaced as a failed
  // mark-as-read for a change that had in fact been made.
  const body = await res.text();
  if (!body.trim()) return null;
  try {
    return JSON.parse(body);
  } catch {
    // 200 with something that isn't JSON is not a failure either; the
    // caller asked for `format=json` and got what it got.
    return null;
  }
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
  const ttl = LIVE_OBJECTS.has(object) ? RL_MESSAGE_TTL : RL_TTL;
  return withCache(`rl:${object}:${action}:${paramStr}`, ttl, doFetch);
}

// Domains = customer accounts in reseller context
export async function getCustomers() {
  return pbxApi("domain", "read");
}

export async function getCustomer(domain: string) {
  return pbxApi("domain", "read", { domain });
}

// Phone numbers / DIDs. The "smsnumber" object name is misleading — it's
// SMS-only and returns null for every domain in this account. The real DID
// inventory (with a human label per number, e.g. "Main Number", "Fax") lives
// in the "phonenumber" object's dial-plan rules, tagged per-row with
// "domain_owner" (the customer's domain id). The API's own domain_owner
// filter proved unreliable (returned the unfiltered list on repeat calls
// with identical params), so this always fetches the full list — cached for
// 3 minutes and shared across every customer — and filters locally instead.
export async function getDIDs(domain?: string) {
  const rows = ((await pbxApi("phonenumber", "read", {})) ?? []) as Array<Record<string, unknown>>;
  if (!domain) return rows;
  return rows.filter((r) => String(r.domain_owner) === domain);
}

/**
 * The call history for a domain.
 *
 * The date fields are `start_date`/`end_date`, not `start_time`/`end_time`.
 * That is not a pedantic difference: an unrecognised parameter is dropped
 * in silence rather than refused, so asking for the last 24 hours with the
 * wrong name returned 500 rows spanning 26 days and looked like it had
 * worked. Measured, on our own domain: `start_time` -> 500 rows,
 * 2026-10-29 to 2026-11-23; `start_date` -> 4 rows, all of 2026-11-23.
 *
 * Dates are always sent, defaulting to the last 30 days, because the other
 * cdr2 actions (count, report) refuse outright without them and a read
 * without them silently means "whatever the server felt like".
 */
export function cdrDate(d: Date): string {
  // Y-m-d H:i:s, which is what the API asks for by name in its refusal.
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * The most CDRs you can ask for and still be told anything useful.
 *
 * At limit=100 every row carries its nested `CdrR`, which is where the SIP
 * call-ids live. At limit=101 the rows still arrive - all of them - but
 * `CdrR` is gone from every single one. Not truncated, not an error:
 * silently a thinner row. Measured on our own domain, which had 102 calls
 * in the window:
 *
 *   limit=99  -> 99 rows,  99 with CdrR
 *   limit=100 -> 100 rows, 100 with CdrR
 *   limit=101 -> 101 rows, 0 with CdrR
 *   limit=200 -> 102 rows, 0 with CdrR
 *
 * Anything that needs a call-id - recordings, above all - therefore has to
 * ask in hundreds. There is no offset or page parameter on cdr2/read, so
 * `getCDRsPaged` walks backwards through time instead.
 */
export const CDR_DETAIL_LIMIT = 100;

/**
 * Call records with their nested detail intact, however many there are.
 *
 * Pages by time rather than by offset, because cdr2/read has no offset:
 * each round asks for the hundred calls ending at the cursor, then moves
 * the cursor to just before the oldest one it got. A round that comes back
 * short has reached the end of the range.
 *
 * Rows are de-duplicated on `cdr_id`: the cursor is a timestamp with
 * one-second resolution, so a second holding two calls would otherwise
 * repeat one of them across the boundary.
 */
export async function getCDRsPaged(opts: {
  domain: string;
  startDate: Date;
  endDate: Date;
  /** Stop once this many records are in hand. */
  max?: number;
}): Promise<Array<Record<string, unknown>>> {
  const max = Math.max(1, opts.max ?? 500);
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let cursor = opts.endDate;

  // Bounded so a server that keeps answering a full page can never spin
  // forever; each round covers at most CDR_DETAIL_LIMIT calls.
  const maxRounds = Math.ceil(max / CDR_DETAIL_LIMIT) + 2;

  for (let round = 0; round < maxRounds; round++) {
    if (out.length >= max || cursor <= opts.startDate) break;

    const rows = ((await pbxApi("cdr2", "read", {
      domain: opts.domain,
      limit: String(CDR_DETAIL_LIMIT),
      start_date: cdrDate(opts.startDate),
      end_date: cdrDate(cursor),
    })) ?? []) as Array<Record<string, unknown>>;

    if (rows.length === 0) break;

    let oldest = Infinity;
    for (const row of rows) {
      const id = String(row.cdr_id ?? "");
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(row);
      }
      const started = Number(row.time_start);
      if (Number.isFinite(started) && started > 0) oldest = Math.min(oldest, started);
    }

    // A short page means the range is exhausted, not that the cursor needs
    // moving - moving it anyway would ask the same question again.
    if (rows.length < CDR_DETAIL_LIMIT || !Number.isFinite(oldest)) break;

    // One second before the oldest call in this page. Anything sharing
    // that second is caught by the de-duplication above.
    cursor = new Date((oldest - 1) * 1000);
  }

  return out.slice(0, max);
}

export async function getCDRs(opts?: {
  domain?: string;
  limit?: string;
  startDate?: string;
  endDate?: string;
}) {
  const params: Record<string, string> = {};
  if (opts?.domain) params.domain = opts.domain;
  if (opts?.limit)  params.limit  = opts.limit;
  params.start_date = opts?.startDate || cdrDate(new Date(Date.now() - 30 * 86_400_000));
  params.end_date   = opts?.endDate   || cdrDate(new Date());
  return pbxApi("cdr2", "read", params);
}

/**
 * SMS/MMS conversations for one extension.
 *
 * Texts to our numbers surface in Teams through the RingLogix connector,
 * but Teams is only displaying them - the messages themselves live here,
 * and this is the only place they can be read from.
 *
 * Both `domain` and `user` are required: the API answers "Please include
 * domain and user fields" without them, because a session belongs to the
 * extension that holds the conversation rather than to the number.
 */
export async function getMessageSessions(domain: string, user: string) {
  return pbxApi("messagesession", "read", { domain, user });
}

/** Every message in one conversation, newest first as stored. */
export async function getMessages(domain: string, user: string, sessionId: string) {
  return pbxApi("message", "read", { domain, user, session_id: sessionId });
}

/**
 * Sends a message: a text to the outside world, or a chat to a colleague.
 *
 * `type` is the difference and the default is wrong for our purposes.
 * Without it RingLogix creates a *chat* - an internal message addressed to
 * a user inside the domain. Aimed at a customer's number that user does
 * not exist, so the message is accepted (202, no warning) and simply never
 * goes anywhere. It took sending one to our own second line to see it:
 * `"type":"chat"`, `term_uid:"18054833939@277215"`, and no carrier.
 *
 * An SMS additionally needs `from_num` - which of our numbers it comes
 * from - and RingLogix refuses without it. The answer is the `smsani` on
 * the conversation, so a reply arrives from the number they already know.
 *
 * Passing no `fromNumber` sends an internal chat, which is the right
 * behaviour when the other party is an extension rather than a number.
 *
 * A write, so it deliberately bypasses the read cache in pbxApi.
 */
export async function sendMessage(opts: {
  domain: string;
  user: string;
  destination: string;
  message: string;
  /** Our number, for a text. Omit to send an internal chat. */
  fromNumber?: string;
}) {
  const params: Record<string, string> = {
    domain: opts.domain,
    user: opts.user,
    destination: opts.destination,
    message: opts.message,
  };
  if (opts.fromNumber) {
    params.type = "sms";
    params.from_num = opts.fromNumber;
  }
  const sent = await pbxApi("message", "create", params);
  // Drop the cached view of this mailbox so the next poll sees the reply
  // rather than a list from before it was sent.
  invalidate("rl:messagesession");
  invalidate("rl:message:");
  return sent;
}

/**
 * Marks a conversation read or unread.
 *
 * Written through to the PBX rather than kept locally, so that marking
 * something read here marks it read in Teams too - two inboxes that
 * disagree about what has been dealt with is worse than neither.
 */
export async function setMessageSessionStatus(opts: {
  domain: string;
  user: string;
  sessionId: string;
  read: boolean;
}) {
  const result = await pbxApi("messagesession", "update", {
    domain: opts.domain,
    user: opts.user,
    session_id: opts.sessionId,
    last_status: opts.read ? "read" : "unread",
  });
  invalidate("rl:messagesession");
  return result;
}

/**
 * Names a conversation, or clears the name.
 *
 * Stored in the PBX rather than in our own tables, so a group somebody
 * names here is named in Teams as well - the two are windows onto one
 * mailbox, and a name that only exists in one of them is a name half the
 * company cannot see.
 */
export async function setMessageSessionName(opts: {
  domain: string;
  user: string;
  sessionId: string;
  name: string;
}) {
  const result = await pbxApi("messagesession", "update", {
    domain: opts.domain,
    user: opts.user,
    session_id: opts.sessionId,
    session_name: opts.name,
  });
  invalidate("rl:messagesession");
  return result;
}

// Reseller client billing
/**
 * Billing is not available through this API, and asking says so.
 *
 * `reseller_client` is answered "Bad request. Unknown object." - it is not
 * a permission the Reseller scope is missing, the object does not exist.
 * RingLogix's own overview lists billing under the RingOS API and marks
 * that "Currently Unavailable", so there is nothing to point this at: no
 * balances, no invoices, no commissions. The portal scrape in
 * lib/ringlogix-portal.ts is the only source we have for a balance.
 *
 * Thrown rather than returned empty so the page says why instead of
 * showing an empty table that looks like a customer with no charges.
 */
export const BILLING_UNAVAILABLE =
  "RingLogix has no billing API. Billing and invoices are part of their RingOS API, " +
  "which they list as unavailable; the only figures we can get are the balance and " +
  "credit limit scraped from the portal.";

export async function getBilling(): Promise<never> {
  throw new Error(BILLING_UNAVAILABLE);
}

// Subscribers / extensions
export async function getSubscribers(domain?: string) {
  const params: Record<string, string> = {};
  if (domain) params.domain = domain;
  return pbxApi("subscriber", "read", params);
}

// SIP devices / registered phones
/**
 * The provisioned device inventory: actual hardware, one row per MAC.
 *
 * Not the same thing as device/read, which lists SIP endpoints. Those
 * include every soft registration and every extension that answers calls
 * without being a phone at all (auto attendants, paging, "Internet
 * Service"), which is why the Devices tab used to show 193 "devices" for a
 * customer that owns 58. It also misses hardware that happens not to be
 * registered right now: two customers show 0 endpoints against 24 and 29
 * real phones.
 *
 * The object is called "mac" because that's its key. Each row carries the
 * model and device1..deviceN, the lines programmed onto that phone.
 */
export async function getDeviceInventory(domain?: string) {
  const params: Record<string, string> = {};
  if (domain) params.domain = domain;
  return pbxApi("mac", "read", params);
}

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

/**
 * The recordings of one call.
 *
 * There is no "list every recording" call, which is what this used to try:
 * `recording/read` with a domain and a limit is answered "Missing request
 * parameters", so the Recordings page has never shown anything. The object
 * is keyed on the call, and takes all four of domain, orig_callid,
 * term_callid and callid.
 *
 * Those call-ids are not on the CDR row itself - the top level carries
 * `cdr_id` and nothing else usable. They are inside the nested `CdrR`
 * object, which is why this takes them separately rather than a CDR.
 *
 * A 404 means that call was not recorded, which is the normal answer for
 * most calls and for every domain that has recording switched off. It is
 * not a permission problem, so it comes back as an empty list rather than
 * as an error.
 */
export async function getRecording(opts: {
  domain: string;
  origCallid: string;
  termCallid: string;
}) {
  if (!opts.domain || (!opts.origCallid && !opts.termCallid)) return [];
  try {
    return await pbxApi("recording", "read", {
      domain: opts.domain,
      orig_callid: opts.origCallid,
      term_callid: opts.termCallid,
      callid: opts.termCallid || opts.origCallid,
    });
  } catch (err) {
    if (err instanceof RingLogixError && err.status === 404) return [];
    throw err;
  }
}

/**
 * The agents on one queue.
 *
 * Per queue rather than per domain: `agent/read` refuses without a
 * `queue_name`. The parameter is `queue_name` for read and `queue` for
 * count, which is the API's inconsistency rather than a typo here.
 */
export async function getQueueAgents(domain: string, queueName: string) {
  return pbxApi("agent", "read", { domain, queue_name: queueName });
}

/**
 * Live queue figures: callers waiting, longest wait, agents available.
 *
 * One row per queue, as of the moment it is asked - these are gauges, not
 * history, so they are not worth caching for the usual three minutes.
 */
export async function getQueueStats(domain: string) {
  return pbxApiRaw("callqueuestat", "read", { domain });
}

/**
 * Territories are not readable either: "Bad request. Unknown object."
 *
 * Our territory id (277202) is in the token, and the one place it matters
 * - reading CDRs across the whole reseller - takes it as a parameter, so
 * nothing is lost by not being able to list them.
 */
export const TERRITORIES_UNAVAILABLE =
  "RingLogix has no territory object; the only territory we belong to is the one in our own token.";

export async function getTerritories(): Promise<never> {
  throw new Error(TERRITORIES_UNAVAILABLE);
}

/** Our reseller territory, from the API user's own client id. */
export function ourTerritory(): string {
  return (API_ID ?? "").match(/-r(\d+)/)?.[1] ?? "";
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

/**
 * Wake-up calls, per subscriber.
 *
 * `callrequest/read` refuses a domain on its own - "Missing parameter
 * 'orig_address'" - because a call request belongs to the extension it will
 * ring, not to the domain. `orig_address` is that extension; the API also
 * wants `user` and `domain` alongside it, which are the same extension said
 * two more ways.
 *
 * So there is no "every wake-up call on this domain" read, any more than
 * there is one for recordings. A caller walks the subscribers it cares
 * about.
 */
export async function getCallRequests(opts: { domain: string; user: string }) {
  return pbxApi("callrequest", "read", {
    domain: opts.domain,
    user: opts.user,
    orig_address: opts.user,
  });
}

/**
 * Books a wake-up call.
 *
 * The actions are `add` and `del`. They were `addWakeUp` and `delWakeUp`
 * here, which are not actions this API has - so every wake-up call this
 * app ever tried to book was refused. Corrected against the published
 * spec rather than against a live write: booking a real call on a real
 * extension is not a thing to try out.
 *
 * Either an absolute `timeToCall` in GMT, or an offset in days/hours/
 * minutes from now.
 */
export async function addWakeUpCall(
  uid: string,
  opts: { timeToCall?: string; dDay?: string; dHour?: string; dMin?: string },
) {
  const params: Record<string, string> = { uid };
  if (opts.timeToCall) params.timeToCall = opts.timeToCall;
  if (opts.dDay)       params.dDay       = opts.dDay;
  if (opts.dHour)      params.dHour      = opts.dHour;
  if (opts.dMin)       params.dMin       = opts.dMin;
  return pbxApi("callrequest", "add", params);
}

export async function deleteWakeUpCall(uid: string, requestId?: string) {
  const params: Record<string, string> = { uid };
  if (requestId) params.requestId = requestId;
  return pbxApi("callrequest", "del", params);
}

// Dial Rules
export async function getDialRules(domain: string, dialplan: string) {
  return pbxApi("dialrule", "read", { domain, dialplan });
}

export async function createDialRule(domain: string, dialplan: string, matchrule: string, toUser: string) {
  return pbxApi("dialrule", "create", { domain, dialplan, matchrule, to_user: toUser });
}
