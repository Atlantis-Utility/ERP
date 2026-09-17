// `err instanceof Error` is unreliable for Supabase/fetch rejections: realm-crossing
// or non-Error throws (stale session, network blips) fail that check even though the
// object carries a real message. Read fields directly instead of gating on the type.
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; hint?: unknown; code?: unknown };
    if (typeof e.message === "string" && e.message) {
      // The browser's fetch() never got a response at all (no HTTP status, no body):
      // could be offline, a VPN/firewall, or an extension blocking the request. Postgres/RLS
      // errors always come back with a real code, so this is the one case worth naming
      // explicitly instead of showing the raw "TypeError: Failed to fetch".
      if (/failed to fetch|networkerror|load failed/i.test(e.message)) {
        return "Network error: couldn't reach the database. Check your internet connection, VPN, or browser extensions (ad blockers can block requests), then try again.";
      }
      return e.hint && typeof e.hint === "string" ? `${e.message} (${e.hint})` : e.message;
    }
  }
  return fallback;
}

export function getAvatarColor(name: string): { bg: string; text: string } {
  const colors = [
    { bg: 'bg-[#e8f2ff]', text: 'text-[#0070f3]' },
    { bg: 'bg-[#e8fdf0]', text: 'text-[#17c964]' },
    { bg: 'bg-[#fff0f5]', text: 'text-[#f31260]' },
    { bg: 'bg-[#fff8e6]', text: 'text-[#f5a524]' },
    { bg: 'bg-[#f1f1f1]', text: 'text-[#666]' },
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const hasTime = dateStr.includes("T") && !dateStr.endsWith("T00:00") && !dateStr.endsWith("T00:00:00.000Z");
  if (hasTime) {
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatSalary(salary: number): string {
  return `$${(salary / 1000).toFixed(0)}k/yr`;
}

export function formatNumber(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}k`;
  return `$${amount}`;
}

/**
 * US numbers as (XXX)-XXX-XXXX, so a list of them lines up instead of showing
 * every format a CSV happened to carry: "(805)948-2830", "805 653-6794" and
 * "8059482830" all read the same way here.
 *
 * Anything that isn't a plain 10-digit number is returned untouched rather
 * than forced into the shape. An extension, a short code or an international
 * number is still the number someone has to dial, and reformatting it by
 * guesswork would make it wrong.
 */
export function formatPhone(raw: string | undefined | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  // Leading country code on an otherwise ordinary US number.
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length !== 10) return raw.trim();
  return `(${local.slice(0, 3)})-${local.slice(3, 6)}-${local.slice(6)}`;
}

/** Digits only, for a tel: href, where punctuation is noise. */
export function telHref(raw: string | undefined | null): string {
  const digits = (raw ?? '').replace(/[^\d+]/g, '');
  return `tel:${digits}`;
}

/**
 * Makes a stored URL safe to put in an href.
 *
 * People type and lists carry "linkedin.com/company/x" and "www.example.com"
 * far more often than a full URL, and a scheme-less href is a *relative* one:
 * the browser resolves it against the current page, so clicking a lead's
 * LinkedIn link navigated to our own domain instead of LinkedIn. Returns
 * undefined for an empty value so the caller can drop the link entirely
 * rather than render one that goes nowhere.
 *
 * Anything with a scheme is left alone, apart from javascript: and data:,
 * which have no business coming out of a spreadsheet import and would be a
 * way to run script from a pasted cell.
 */
export function withScheme(url: string | undefined | null): string | undefined {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return undefined;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return undefined;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
