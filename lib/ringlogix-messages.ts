// Text messages, in the shape a person reads them.
//
// Atlantis's numbers are SMS-enabled and the texts appear in Teams, which
// makes it easy to assume Teams is where they live. It isn't: Teams is a
// display surface for the RingLogix connector, and the messages are stored
// in the PBX. That matters because it means they can be read without any
// Microsoft permission, consent or per-message fee.
//
// Field meanings verified against live data on 2026-11-20.

/** A conversation as `messagesession` stores it. All values are strings. */
export interface RawMessageSession {
  session_id?: string;
  user?: string;
  domain?: string;
  /** The other party's number. */
  remote?: string;
  /** Our number - the one they texted. */
  smsani?: string;
  /** "2026-11-20 23:27:01", UTC. */
  last_timestamp?: string;
  last_mesg?: string;
  last_sender?: string;
  /** "unread" when nobody here has opened it. */
  last_status?: string;
  muted?: string;
  last_mesg_type?: string;
  last_mesg_media_type?: string;
  session_name?: string;
  session_type?: string;
}

/** One message as `message` stores it. */
export interface RawMessage {
  id?: string;
  /** "2026-11-20 23:27:01", UTC. */
  timestamp?: string;
  type?: string;
  /** "orig" = they sent it, "term" = we sent it. */
  direction?: string;
  from_num?: string;
  /** "100@277215" when one of our extensions sent it; blank from outside. */
  from_uid?: string;
  term_uid?: string;
  dialed?: string;
  text?: string;
  status?: string;
  media_type?: string;
  media_size?: string;
  /**
   * Where the picture actually lives: a RingLogix URL that needs our bearer
   * token, so the browser cannot fetch it directly and the app proxies it.
   */
  remotepath?: string;
  session_id?: string;
}

export interface SmsConversation {
  sessionId: string;
  /** The extension here that holds the conversation. */
  user: string;
  domain: string;
  /** Their number, digits only. Empty when the other party is a colleague. */
  remote: string;
  /**
   * Everyone on the far side. One number for an ordinary conversation,
   * several for a group - RingLogix stores those as a JSON array, which
   * reduced to digits became "1310908584718052128139": two phone numbers
   * glued into something that is not a phone number.
   */
  remoteNumbers: string[];
  /** A group text: more than one person on the other end. */
  isGroup: boolean;
  /**
   * The colleague's extension, when the conversation is an internal one.
   *
   * Staff text each other through the same system, and those sessions
   * carry "104@277215" where a customer's carries a phone number. Reduced
   * to digits it became "104277215", which reads as a phone number and is
   * not one.
   */
  remoteExtension: string;
  /** Our number, the one they texted. */
  ourNumber: string;
  lastMessage: string;
  /** True when they sent the last message - i.e. it's our turn. */
  theirTurn: boolean;
  lastAt: number; // ms
  unread: boolean;
  muted: boolean;
  /** A name somebody gave the conversation, where one was given. */
  name: string;
  hasMedia: boolean;
}

export interface SmsMessage {
  id: string;
  at: number; // ms
  /** "in" = from them, "out" = from this conversation's own extension. */
  direction: "in" | "out";
  from: string;
  to: string;
  /** The extension that sent it, when one of ours did: "100". */
  fromExtension: string;
  /**
   * Who sent it, in words. One of our people by name, otherwise the other
   * party's number. Without this a thread is a wall of grey and blue with
   * no way to tell which colleague answered.
   */
  fromName: string;
  text: string;
  /**
   * The status RingLogix stores, verbatim. Not a delivery receipt: every
   * outbound message in this tenant reads "sending" for ever, including
   * ones the other party has already replied to, so it is kept for the
   * record and deliberately not shown.
   */
  status: string;
  mediaType: string;
  /** Bytes, as RingLogix counted them. 0 when there is no attachment. */
  mediaSize: number;
  /** True when there is something to fetch through the media proxy. */
  hasMedia: boolean;
  /**
   * Set when this went out from the ERP and we know which person sent it,
   * in which case `fromName` is that person rather than the extension's
   * owner.
   */
  sentFromErp?: boolean;
}

/**
 * "2026-11-20 23:27:01" -> ms.
 *
 * Stored UTC with no zone marker, which JavaScript would otherwise read as
 * local time and shift by eight hours. The proof it is UTC: the newest
 * message in the mailbox is stamped ahead of the current local clock and
 * behind the current UTC clock, which only works one way round.
 */
export function parseTimestamp(value: string | undefined | null): number {
  if (!value) return 0;
  const iso = value.trim().replace(" ", "T");
  const ms = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return Number.isFinite(ms) ? ms : 0;
}

/** Digits only, so a number compares equal however it was written. */
export function digitsOf(value: string | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * "100@277215" -> "100". Blank for anything that isn't inside our domain.
 *
 * The "@" is the whole test. An earlier version also required the user to
 * be short, on the assumption that an internal party is always a three
 * digit extension - but some of our users *are* numbers (the DIDs appear
 * in the subscriber list), and those threads came out as "18054833939277215":
 * the "@" stripped by digitsOf, leaving something that looks like a phone
 * number and is not one.
 */
export function extensionOf(uid: string | undefined | null): string {
  const value = (uid ?? "").trim();
  if (!value.includes("@")) return "";
  return value.split("@")[0].trim();
}

/**
 * Everyone on the far side of a conversation.
 *
 * A one-to-one carries a plain number; a group carries a JSON array of
 * them. Both come back as a list, so callers stop having to care.
 */
export function remoteNumbersOf(raw: string | undefined | null): string[] {
  const value = (raw ?? "").trim();
  if (value.startsWith("[")) {
    try {
      return (JSON.parse(value) as unknown[])
        .map((n) => digitsOf(String(n)))
        .filter(Boolean);
    } catch {
      return [];
    }
  }
  const one = digitsOf(value);
  return one ? [one] : [];
}

export function normalizeSession(raw: RawMessageSession): SmsConversation {
  const remoteExtension = extensionOf(raw.remote);
  const remoteNumbers = remoteExtension ? [] : remoteNumbersOf(raw.remote);
  const isGroup = remoteNumbers.length > 1 || (raw.session_type ?? "") === "group-mms";
  // The first number stands for the conversation where one has to; the
  // full list is what a group is actually addressed to.
  const remote = remoteExtension ? "" : remoteNumbers[0] ?? "";
  return {
    remoteExtension,
    remoteNumbers,
    isGroup,
    sessionId: raw.session_id ?? "",
    user: raw.user ?? "",
    domain: raw.domain ?? "",
    remote,
    ourNumber: digitsOf(raw.smsani),
    lastMessage: (raw.last_mesg ?? "").trim(),
    // The sender of the last message is a number: theirs or ours.
    theirTurn: remoteExtension
      ? extensionOf(raw.last_sender) === remoteExtension || digitsOf(raw.last_sender) === remoteExtension
      // Anybody on the far side counts, which for a group is several
      // people; ours is the one that carries an extension.
      : !extensionOf(raw.last_sender) && remoteNumbers.includes(digitsOf(raw.last_sender)),
    lastAt: parseTimestamp(raw.last_timestamp),
    unread: (raw.last_status ?? "").toLowerCase() === "unread",
    muted: (raw.muted ?? "").toLowerCase() === "yes",
    name: (raw.session_name ?? "").trim(),
    hasMedia: Boolean((raw.last_mesg_media_type ?? "").trim()),
  };
}

/**
 * One message, told apart by who sent it rather than by `direction`.
 *
 * `direction` is "orig"/"term" on a text to or from the outside world and
 * *empty* on an internal one between two extensions - which read as
 * incoming on both sides, so a colleague's conversation with another
 * colleague appeared as fifty messages nobody had answered.
 *
 * `from_uid` is reliable in both cases: it names the extension that sent
 * it, and is blank when the sender was the outside world.
 */
export function normalizeMessage(
  raw: RawMessage,
  opts: { owner?: string; names?: Record<string, string> } = {},
): SmsMessage {
  const fromExtension = extensionOf(raw.from_uid);
  const owner = (opts.owner ?? "").trim();
  const direction: "in" | "out" = fromExtension
    ? (owner ? (fromExtension === owner ? "out" : "in") : "out")
    : raw.direction === "term" ? "out" : "in";

  const fromName = fromExtension
    ? opts.names?.[fromExtension] ?? `Extension ${fromExtension}`
    : "";

  return {
    id: raw.id ?? `${raw.timestamp ?? ""}-${raw.from_num ?? ""}`,
    at: parseTimestamp(raw.timestamp),
    direction,
    fromExtension,
    fromName,
    from: digitsOf(raw.from_num),
    to: digitsOf(raw.dialed),
    text: raw.text ?? "",
    status: (raw.status ?? "").trim(),
    mediaType: (raw.media_type ?? "").trim(),
    mediaSize: Number(raw.media_size ?? "0") || 0,
    hasMedia: Boolean((raw.remotepath ?? "").trim()),
  };
}

/**
 * One row per conversation.
 *
 * A session can be returned by more than one extension - a shared number,
 * a queue and the agent in it - and it is the same conversation each time,
 * carrying the same session id. Left alone, it appears twice in the list
 * and React is handed two children with one key.
 *
 * The copy kept is the one with the most recent activity, because a stale
 * copy can lag behind on read state and on the last message.
 */
export function dedupeConversations(list: SmsConversation[]): SmsConversation[] {
  const best = new Map<string, SmsConversation>();
  for (const c of list) {
    const seen = best.get(c.sessionId);
    if (!seen || c.lastAt > seen.lastAt) best.set(c.sessionId, c);
  }
  return [...best.values()];
}

/**
 * Newest conversation first, and only that.
 *
 * Sorting unread to the top is the obvious thing and the wrong thing here:
 * the desk reads these in Teams, which does not clear the PBX's own flag,
 * so 115 of 154 conversations are marked unread and 114 of those are more
 * than a week old. Honouring it would bury this afternoon's conversation
 * under a month of "STOP" replies. The flag is still shown as a dot,
 * where it costs nothing if it is wrong.
 */
export function sortConversations(list: SmsConversation[]): SmsConversation[] {
  return [...list].sort((a, b) => b.lastAt - a.lastAt);
}

/**
 * Extension -> the person on it, from the subscriber list.
 *
 * `first_name`/`last_name` are what the directory holds; `callid_name` is
 * the fallback because a shared line ("Ticketing System Voicemail") has
 * one of those and no person's name.
 */
export function namesByExtension(
  subscribers: Array<{ user?: string; first_name?: string; last_name?: string; callid_name?: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of subscribers) {
    const user = (s.user ?? "").trim();
    if (!user) continue;
    const full = `${s.first_name ?? ""} ${s.last_name ?? ""}`.replace(/\s+/g, " ").trim();
    const name = full || (s.callid_name ?? "").trim();
    if (name) out[user] = name;
  }
  return out;
}

/** Oldest first - a conversation reads downwards. */
export function sortMessages(list: SmsMessage[]): SmsMessage[] {
  return [...list].sort((a, b) => a.at - b.at);
}
