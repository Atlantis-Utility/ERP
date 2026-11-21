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
  dialed?: string;
  text?: string;
  status?: string;
  media_type?: string;
  media_size?: string;
  session_id?: string;
}

export interface SmsConversation {
  sessionId: string;
  /** The extension here that holds the conversation. */
  user: string;
  domain: string;
  /** Their number, digits only. */
  remote: string;
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
  /** "in" = from them, "out" = from us. */
  direction: "in" | "out";
  from: string;
  to: string;
  text: string;
  /**
   * The status RingLogix stores, verbatim. Not a delivery receipt: every
   * outbound message in this tenant reads "sending" for ever, including
   * ones the other party has already replied to, so it is kept for the
   * record and deliberately not shown.
   */
  status: string;
  mediaType: string;
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

export function normalizeSession(raw: RawMessageSession): SmsConversation {
  const remote = digitsOf(raw.remote);
  return {
    sessionId: raw.session_id ?? "",
    user: raw.user ?? "",
    domain: raw.domain ?? "",
    remote,
    ourNumber: digitsOf(raw.smsani),
    lastMessage: (raw.last_mesg ?? "").trim(),
    // The sender of the last message is a number: theirs or ours.
    theirTurn: digitsOf(raw.last_sender) === remote && remote !== "",
    lastAt: parseTimestamp(raw.last_timestamp),
    unread: (raw.last_status ?? "").toLowerCase() === "unread",
    muted: (raw.muted ?? "").toLowerCase() === "yes",
    name: (raw.session_name ?? "").trim(),
    hasMedia: Boolean((raw.last_mesg_media_type ?? "").trim()),
  };
}

export function normalizeMessage(raw: RawMessage): SmsMessage {
  return {
    id: raw.id ?? `${raw.timestamp ?? ""}-${raw.from_num ?? ""}`,
    at: parseTimestamp(raw.timestamp),
    direction: raw.direction === "term" ? "out" : "in",
    from: digitsOf(raw.from_num),
    to: digitsOf(raw.dialed),
    text: raw.text ?? "",
    status: (raw.status ?? "").trim(),
    mediaType: (raw.media_type ?? "").trim(),
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

/** Newest conversation first; an unread one is never buried under a read one. */
export function sortConversations(list: SmsConversation[]): SmsConversation[] {
  return [...list].sort((a, b) => {
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    return b.lastAt - a.lastAt;
  });
}

/** Oldest first - a conversation reads downwards. */
export function sortMessages(list: SmsMessage[]): SmsMessage[] {
  return [...list].sort((a, b) => a.at - b.at);
}
