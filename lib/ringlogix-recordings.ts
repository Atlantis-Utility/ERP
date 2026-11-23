/**
 * Call recordings, as this API actually returns them.
 *
 * Two shapes come back from the same endpoint for the same question: an
 * array of recordings, or an object keyed "1", "2", ... Both were seen on
 * one domain within a second of each other, so neither is the exception.
 */

export interface RawRecording {
  status?: string;
  call_id?: string;
  time_open?: string;
  time_close?: string;
  duration?: string;
  url?: string;
  size?: string;
  geo_id?: string;
  case_id?: string;
}

export interface CallRecording {
  callId: string;
  /** "converted" once it can be played; "archived" for the older ones. */
  status: string;
  /** Seconds. The CDR's own talk time can differ - this is the audio. */
  seconds: number;
  startedAt: string;
  endedAt: string;
  /**
   * RingLogix's own signed address, which carries an `auth` token and a
   * timestamp and therefore expires. Kept server-side and never sent to a
   * browser: it is a bearer credential for the audio, and a link that
   * leaks is a recording that leaks. The page gets our own proxy instead.
   */
  sourceUrl: string;
}

/**
 * What makes two rows the same recording.
 *
 * Neither the address nor the call id, both of which repeat the same audio
 * under different names:
 *
 *  - The same call came back as {"1": ..., "2": ...} differing only in the
 *    `casid` on the URL - `*@277215`, the domain's copy, against
 *    `502@277215`, the copy filed under the extension that was on the
 *    call. Same recording, two ways in.
 *  - The same call also yields two rows whose `call_id` differs only in
 *    its trailing server id (`...-3f6dfdcc...` against `...-9b4b04e0...`).
 *    Those are the two recording servers holding a copy each, not two
 *    recordings. A twelve-minute call listed twice, identical.
 *
 * So the identity is the audio: when it started and how long it runs. A
 * recording paused and resumed produces genuinely separate segments with
 * their own `time_open`, and those still come through as two.
 */
function identityOf(r: CallRecording): string {
  return `${r.startedAt}|${r.seconds}`;
}

/** Either shape, flattened and de-duplicated; no address, no entry. */
export function normalizeRecordings(payload: unknown): CallRecording[] {
  if (!payload) return [];
  const rows: RawRecording[] = Array.isArray(payload)
    ? (payload as RawRecording[])
    : typeof payload === "object"
      // The keys are "1", "2", ... and carry no meaning beyond order.
      ? (Object.values(payload as Record<string, RawRecording>) as RawRecording[])
      : [];

  const mapped = rows
    .filter((r): r is RawRecording => Boolean(r && typeof r === "object" && r.url))
    .map((r) => ({
      callId: (r.call_id ?? "").trim(),
      status: (r.status ?? "").trim(),
      seconds: Number(r.duration ?? 0) || 0,
      startedAt: (r.time_open ?? "").trim(),
      endedAt: (r.time_close ?? "").trim(),
      sourceUrl: r.url!.trim(),
    }));

  const seen = new Set<string>();
  return mapped.filter((r) => {
    const key = identityOf(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** mm:ss, or h:mm:ss once a call runs past the hour. */
export function formatLength(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The call-ids `recording/read` needs, dug out of a CDR.
 *
 * They are in the nested `CdrR`, not on the row itself - the top level has
 * `cdr_id`, which this endpoint does not accept. Asking with the CDR's own
 * fields returns "Missing request parameters" and looks like a broken
 * account rather than a wrong lookup.
 */
export function callIdsOf(cdr: unknown): { origCallid: string; termCallid: string } {
  const r = (cdr as { CdrR?: Record<string, unknown> } | null)?.CdrR ?? {};
  return {
    origCallid: String(r.orig_callid ?? "").trim(),
    termCallid: String(r.term_callid ?? "").trim(),
  };
}
