/**
 * The origin to build absolute URLs from inside a route handler.
 *
 * `new URL(req.url).origin` is the internal address behind a proxy, which
 * is how an OAuth redirect_uri ends up pointing at something the browser
 * can't reach. Prefers an explicit NEXT_PUBLIC_SITE_URL, then the
 * forwarded host the platform sets, and only then the request's own URL.
 */
export function appOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return new URL(req.url).origin;
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
