/**
 * Voicemail, from the UC Inbox.
 *
 * `conversation/read` is the only endpoint that exposes voicemail at all -
 * there is no vmail object - and it mixes it in with chat sessions, one
 * extension at a time. These are the vmail rows, in the shape a page reads.
 */

export interface RawConversation {
  conversation_type?: string;
  conversation_id?: string;
  /** vmail only, below here. */
  filename?: string;
  index?: string;
  length?: number | string;
  filesize?: string;
  filedate?: string;
  remotepath?: string;
  FromName?: string;
  FromUser?: string;
  FromHost?: string;
  NmsAni?: string;
  RecordTime?: string;
  NmsRecStartTime?: string;
  NmsRecDuration?: string;
  TimeZone?: string;
  transcription?: string;
  VmailForwarded?: string;
}

export interface Voicemail {
  id: string;
  /** The extension whose mailbox this is in. */
  mailbox: string;
  /** Who left it: a name where the PBX knows one, else the number. */
  fromName: string;
  fromNumber: string;
  /** Seconds. */
  seconds: number;
  /** "2026-11-11 17:28:33", in the mailbox's own timezone. */
  recordedAt: string;
  timeZone: string;
  bytesLabel: string;
  /** Empty unless transcription is switched on for the mailbox. */
  transcription: string;
  forwarded: boolean;
  /**
   * RingLogix's signed address for the audio. Kept server-side: it carries
   * an `auth` token and a timestamp, so it is both a credential for a
   * customer's voicemail and a link that expires.
   */
  sourceUrl: string;
}

/**
 * The audio address, actually usable.
 *
 * `remotepath` arrives HTML-escaped - `&amp;` where the query string needs
 * `&`. Fetched as given it is answered 400 with an empty body, which reads
 * as "the recording is gone" rather than "the URL was mangled". Measured:
 * as given 400/0 bytes, unescaped 200/30,124 bytes of WAVE.
 *
 * Only the ampersand is escaped in practice, but the others are decoded
 * too, since whatever escaped this did not do it on purpose.
 */
export function decodeAudioUrl(path: string): string {
  return (path ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** The vmail rows of one mailbox, newest first. */
export function voicemailsOf(payload: unknown, mailbox: string): Voicemail[] {
  if (!payload) return [];
  const rows: RawConversation[] = Array.isArray(payload)
    ? (payload as RawConversation[])
    : typeof payload === "object"
      ? (Object.values(payload as Record<string, RawConversation>) as RawConversation[])
      : [];

  return rows
    .filter((r) => r && r.conversation_type === "vmail" && r.remotepath)
    .map((r) => ({
      id: String(r.conversation_id ?? r.index ?? r.filename ?? "").trim(),
      mailbox,
      fromName: String(r.FromName ?? "").replace(/\s+/g, " ").trim(),
      // FromUser is an extension for an internal message and a phone number
      // for an outside one; NmsAni carries a trailing marker ("102m") that
      // is not part of the number.
      fromNumber: String(r.FromUser ?? "").trim(),
      seconds: Number(r.NmsRecDuration ?? r.length ?? 0) || 0,
      recordedAt: String(r.RecordTime ?? r.filedate ?? "").trim(),
      timeZone: String(r.TimeZone ?? "").trim(),
      bytesLabel: String(r.filesize ?? "").trim(),
      transcription: String(r.transcription ?? "").trim(),
      forwarded: String(r.VmailForwarded ?? "").toLowerCase() === "yes",
      sourceUrl: decodeAudioUrl(String(r.remotepath)),
    }))
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

/** How many chat sessions the same payload held, for callers that care. */
export function chatCountOf(payload: unknown): number {
  if (!payload) return 0;
  const rows: RawConversation[] = Array.isArray(payload)
    ? (payload as RawConversation[])
    : typeof payload === "object"
      ? (Object.values(payload as Record<string, RawConversation>) as RawConversation[])
      : [];
  return rows.filter((r) => r?.conversation_type === "chat").length;
}
