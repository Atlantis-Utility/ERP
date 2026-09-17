/**
 * Reading Outlook event times without getting the day or the hour wrong.
 *
 * The events route asks Graph for `Prefer: outlook.timezone="UTC"`, and Graph
 * answers with a naive string, "2026-09-17T16:30:00.0000000", carrying the
 * zone in a separate field the route drops. JavaScript reads a date-time with
 * no offset as *local*, so that 16:30 UTC became 4:30pm to the reader instead
 * of 9:30am Pacific, and taking the first ten characters as the day put a
 * 7pm Pacific meeting on tomorrow, because 02:00 UTC is already the next day.
 *
 * Both consumers (the Calendar page and the dashboard's schedule strip) go
 * through here so they can't disagree about which day a meeting is on.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Parses a value from the events route into a real instant.
 *
 * A value with no offset is treated as UTC rather than local, because that is
 * what the route asked Graph for. That also keeps older values cached in
 * localStorage, written before the route appended the Z, reading correctly.
 */
export function outlookInstant(value: string): Date {
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasOffset ? value : `${value}Z`);
}

/** The local calendar day a meeting falls on, as yyyy-mm-dd. */
export function outlookLocalDay(value: string): string {
  if (!value) return "";
  // An all-day event is a plain date with no time to convert.
  if (value.length === 10) return value;
  const at = outlookInstant(value);
  if (isNaN(at.getTime())) return value.slice(0, 10);
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** Sorts a day's meetings: local minutes past midnight, all-day first. */
export function outlookSortKey(value: string, isAllDay: boolean): string {
  if (isAllDay || !value || value.length === 10) return "";
  const at = outlookInstant(value);
  if (isNaN(at.getTime())) return "";
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** "9:30 AM – 10:00 AM", in the reader's own timezone. */
export function outlookTimeRange(start: string, end: string, isAllDay: boolean): string {
  if (isAllDay) return "All day";
  const from = outlookInstant(start);
  if (isNaN(from.getTime())) return "";
  const label = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const to = outlookInstant(end);
  return isNaN(to.getTime()) ? label(from) : `${label(from)} – ${label(to)}`;
}
