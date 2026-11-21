// A call record, in the shape a person reads it.
//
// RingLogix's cdr2 object answers in the PBX's own vocabulary: SIP URIs
// rather than numbers, unix seconds rather than times, and a `type` that
// decides the whole meaning of the row. The page that first displayed these
// was written against field names that do not exist in this tenant
// (`start_time`, `orig_from_user`, `direction`), which nobody noticed
// because the API user's scope had been revoked for two months and the
// table was empty either way. This is the mapping, verified against live
// records on 2026-11-20.

/** One leg as RingLogix stores it. Every value arrives as a string. */
export interface RawCdr {
  cdr_id?: string;
  domain?: string;
  /** "0" origination, "1" termination, "3" internal. See `directionOf`. */
  type?: string;
  orig_sub?: string;
  orig_from_uri?: string;
  /** Caller ID name: "GIUNTA,ANTHONY", "VERIZON", "CAMARILLO    CA". */
  orig_from_name?: string;
  orig_to_user?: string;
  orig_req_user?: string;
  by_sub?: string;
  term_sub?: string;
  term_to_uri?: string;
  /** Unix seconds, as strings. */
  time_start?: string;
  time_answer?: string;
  time_release?: string;
  duration?: string;
  time_talking?: string;
  transcription_job_id?: string;
  top_topics?: string;
  ending_sentiment?: string;
}

export type CallDirection = "inbound" | "outbound" | "internal";

export interface CallRecord {
  id: string;
  domain: string;
  direction: CallDirection;
  /** Digits, no SIP wrapper. Empty when the leg carried no number. */
  fromNumber: string;
  /** Caller ID name as the carrier sent it, tidied. */
  fromName: string;
  toNumber: string;
  /** The extension that took it, where one did. */
  extension: string;
  startedAt: number; // ms
  answeredAt: number | null;
  endedAt: number | null;
  durationSec: number;
  talkSec: number;
  /** A person picked it up. Voicemail does not count. */
  answered: boolean;
  /** It ended at the media server: voicemail, or an auto-attendant. */
  voicemail: boolean;
  /** Nobody took it and it left no message. */
  missed: boolean;
  hasRecording: boolean;
}

/** The user part of a SIP URI: "sip:18056582329@host" -> "18056582329". */
export function uriUser(uri: string | undefined): string {
  if (!uri) return "";
  const withoutScheme = uri.replace(/^sips?:/i, "");
  const at = withoutScheme.indexOf("@");
  return (at === -1 ? withoutScheme : withoutScheme.slice(0, at)).trim();
}

/** Unix seconds as a string -> ms, or null for the blanks and zeroes. */
function epochMs(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n * 1000 : null;
}

/**
 * The media server. A call that ends here reached voicemail or an
 * auto-attendant rather than a person, which is the difference between
 * "they called and we spoke" and "they called and gave up".
 */
function isMediaServer(uri: string | undefined): boolean {
  return /(^|:)nms@/i.test(uri ?? "");
}

/**
 * Which way the call went.
 *
 * `type` is authoritative where it is set - 0 origination (we rang out),
 * 1 termination (it came in), 3 internal (extension to extension). The
 * fallback reads the numbers: an E.164-looking caller reaching one of our
 * extensions is inbound, and anything between two short numbers is
 * internal.
 */
export function directionOf(row: RawCdr): CallDirection {
  switch (row.type) {
    case "0": return "outbound";
    case "1": return "inbound";
    case "3": return "internal";
  }
  const from = uriUser(row.orig_from_uri);
  const to = row.orig_to_user ?? "";
  if (from.length > 6 && to.length <= 6) return "inbound";
  if (from.length <= 6 && to.length > 6) return "outbound";
  return "internal";
}

/**
 * Caller ID names arrive shouted and padded - "CAMARILLO    CA",
 * "GIUNTA,ANTHONY". Collapse the whitespace and put a space after the
 * comma; leave the case alone, because "VERIZON" title-cased is worse than
 * "VERIZON" and a name like "McDonald" would not survive the trip.
 */
export function tidyCallerName(name: string | undefined): string {
  return (name ?? "").replace(/\s+/g, " ").replace(/,(\S)/g, ", $1").trim();
}

export function normalizeCdr(row: RawCdr): CallRecord {
  const direction = directionOf(row);
  const startedAt = epochMs(row.time_start) ?? 0;
  const answeredAt = epochMs(row.time_answer);
  const endedAt = epochMs(row.time_release);
  const voicemail = isMediaServer(row.term_to_uri);
  const talkSec = Number(row.time_talking ?? "0") || 0;

  // Answered by a person: the media server "answers" instantly and still
  // counts talk time, so it has to be excluded by where the call landed
  // rather than by whether a timestamp exists.
  const answered = Boolean(answeredAt) && !voicemail;

  return {
    id: row.cdr_id ?? `${row.time_start ?? ""}-${row.orig_sub ?? ""}-${row.term_sub ?? ""}`,
    domain: row.domain ?? "",
    direction,
    fromNumber: uriUser(row.orig_from_uri),
    fromName: tidyCallerName(row.orig_from_name),
    // For an inbound call the dialled number is ours; for an outbound one
    // it is theirs. Either way it is the number on `orig_to_user`, with the
    // terminating URI as the fallback for legs that omit it.
    toNumber: row.orig_to_user || uriUser(row.term_to_uri),
    extension: row.term_sub ?? row.by_sub ?? "",
    startedAt,
    answeredAt,
    endedAt,
    durationSec: Number(row.duration ?? "0") || 0,
    talkSec,
    answered,
    voicemail,
    missed: !answered && !voicemail,
    hasRecording: Boolean(row.transcription_job_id),
  };
}

/** Newest first, which is the only order anybody wants these in. */
export function normalizeCdrs(rows: RawCdr[]): CallRecord[] {
  return rows.map(normalizeCdr).sort((a, b) => b.startedAt - a.startedAt);
}

/** "2m 14s", "47s", "-" - never a bare count of seconds. */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "-";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * Who the call was with - the other party, whichever end that is. The
 * caller's name when the carrier sent one, otherwise their number.
 */
export function counterparty(call: CallRecord): { number: string; name: string } {
  if (call.direction === "outbound") return { number: call.toNumber, name: "" };
  return { number: call.fromNumber, name: call.fromName };
}
