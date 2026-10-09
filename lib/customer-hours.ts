// When a customer is actually open.
//
// Nothing automatic fills these in. Google has them and charges for the API;
// OpenStreetMap carries none for businesses like these (checked against the
// real address list: addresses geocode, hours come back empty every time).
// So they are typed in, with a link out to a Google Maps search beside the
// field so whoever is filling them in can read them off and copy them over.
//
// The point is the one line on the customer: "Open now · closes 5:00 PM",
// which is what somebody about to pick up the phone needs to know.
//
// No React here — shared by the overview card, the edit drawer and the
// exports.

export interface DayHours {
  /** Shut all day. Takes precedence over whatever is in open/close. */
  closed: boolean;
  /** "HH:MM", 24-hour, as an <input type="time"> gives it. */
  open: string;
  close: string;
}

export interface CustomerHours {
  /** Seven entries, Sunday first, to match Date.getDay(). */
  days: DayHours[];
  /** "Closed 12-1 for lunch", "By appointment on Saturdays". */
  note: string;
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const blankDay = (): DayHours => ({ closed: true, open: "", close: "" });

export const emptyHours = (): CustomerHours => ({
  days: Array.from({ length: 7 }, blankDay),
  note: "",
});

/**
 * A nine-to-five week, as the starting point for a customer nobody has
 * filled in yet. Most of these are trades and offices, so Monday to Friday
 * is the guess that needs the least correcting - but it is only ever
 * offered on an empty form, never saved on anybody's behalf.
 */
export function weekdayDefault(): CustomerHours {
  return {
    days: Array.from({ length: 7 }, (_, day) =>
      day === 0 || day === 6 ? blankDay() : { closed: false, open: "08:00", close: "17:00" },
    ),
    note: "",
  };
}

/** Tolerates a half-written or legacy value, so the UI never reads undefined. */
export function normalizeHours(value: unknown): CustomerHours {
  const raw = (value ?? {}) as Partial<CustomerHours>;
  const days = Array.isArray(raw.days) ? raw.days : [];
  return {
    days: Array.from({ length: 7 }, (_, i) => {
      const d = days[i] as Partial<DayHours> | undefined;
      const open = typeof d?.open === "string" ? d.open : "";
      const close = typeof d?.close === "string" ? d.close : "";
      // A day with no times is closed whatever the flag says, which is what
      // a row somebody ticked open and then never filled in means.
      return { closed: d?.closed !== false || !open || !close, open, close };
    }),
    note: typeof raw.note === "string" ? raw.note : "",
  };
}

/** Whether anything has been filled in - an all-closed week counts as not set. */
export function hasHours(hours: CustomerHours): boolean {
  return hours.days.some((d) => !d.closed) || hours.note.trim().length > 0;
}

/** "17:00" -> "5:00 PM". Anything unparseable comes back as it went in. */
export function formatTime(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const hour = Number(m[1]);
  const minute = m[2];
  if (hour > 23 || Number(minute) > 59) return value;
  const suffix = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute} ${suffix}`;
}

const minutes = (value: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export interface OpenState {
  /** null when nothing is on file: "unknown" is not the same as "shut". */
  open: boolean | null;
  /** "Open now", "Closed", "No hours on file". */
  label: string;
  /** "Closes at 5:00 PM", "Opens Monday at 8:00 AM", or "". */
  detail: string;
}

/**
 * Open or shut, right now.
 *
 * Read in the viewer's own timezone, which for this business is the
 * customer's too - an ISP in Ventura County looking at customers in Ventura
 * County. A customer somewhere else would need their zone stored alongside
 * their hours, and nothing here pretends otherwise.
 *
 * A closing time before its opening time means it runs past midnight, so
 * yesterday's late shift still counts as open at one in the morning.
 */
export function openState(hours: CustomerHours, now: Date = new Date()): OpenState {
  if (!hasHours(hours)) return { open: null, label: "No hours on file", detail: "" };

  const day = now.getDay();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const windowFor = (index: number) => {
    const d = hours.days[index];
    if (!d || d.closed) return null;
    const from = minutes(d.open);
    const to = minutes(d.close);
    return from === null || to === null ? null : { from, to };
  };

  const today = windowFor(day);
  if (today) {
    // Inside today's hours, whether they end this evening or after midnight.
    const insideToday =
      today.to > today.from ? nowMins >= today.from && nowMins < today.to : nowMins >= today.from;
    if (insideToday) {
      return { open: true, label: "Open now", detail: `Closes at ${formatTime(hours.days[day].close)}` };
    }
  }

  // Still inside last night's shift. Checked before "opens later today",
  // because at one in the morning a bar that shuts at two is open now, and
  // at three it opens again this evening - both are about today.
  const yesterday = (day + 6) % 7;
  const last = windowFor(yesterday);
  if (last && last.to <= last.from && nowMins < last.to) {
    return { open: true, label: "Open now", detail: `Closes at ${formatTime(hours.days[yesterday].close)}` };
  }

  if (today && nowMins < today.from) {
    return { open: false, label: "Closed", detail: `Opens at ${formatTime(hours.days[day].open)}` };
  }

  for (let step = 1; step <= 7; step++) {
    const index = (day + step) % 7;
    if (windowFor(index)) {
      const when = step === 1 ? "tomorrow" : DAY_NAMES[index];
      return { open: false, label: "Closed", detail: `Opens ${when} at ${formatTime(hours.days[index].open)}` };
    }
  }
  return { open: false, label: "Closed", detail: "" };
}

export interface HoursLine {
  days: string;
  hours: string;
  /** The weekdays this line covers, so a caller can pick out today's. */
  indexes: number[];
}

/**
 * The week, with runs of identical days folded together: "Mon - Fri, 8:00 AM
 * to 5:00 PM" rather than five lines saying the same thing. Starts on Monday,
 * because a working week does.
 */
export function weekSummary(hours: CustomerHours): HoursLine[] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const text = (index: number) => {
    const d = hours.days[index];
    return !d || d.closed ? "Closed" : `${formatTime(d.open)} – ${formatTime(d.close)}`;
  };

  const lines: HoursLine[] = [];
  let runStart = 0;
  for (let i = 0; i < order.length; i++) {
    const nextDiffers = i === order.length - 1 || text(order[i + 1]) !== text(order[i]);
    if (!nextDiffers) continue;
    const from = DAY_SHORT[order[runStart]];
    const to = DAY_SHORT[order[i]];
    lines.push({
      days: runStart === i ? from : `${from} – ${to}`,
      hours: text(order[i]),
      indexes: order.slice(runStart, i + 1),
    });
    runStart = i + 1;
  }
  return lines;
}

/**
 * A Google Maps search for this customer, which is how the hours get found
 * in the first place: no key, no API, just the search somebody would have
 * typed themselves.
 */
export function googleMapsSearch(name: string, address: string): string {
  const query = [name, address].filter(Boolean).join(" ").trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
