// Server-only helper for Azure Maps Search (POI) API. Used to:
//  1. discover businesses directly from the Leads page (search by area/category), and
//  2. enrich CSV-imported LinkedIn leads (company name + location -> website/phone).
// Unlike Google Places, Azure Maps' POI data has no rating/review-count field at
// all, and no "company size" or "point of contact" field either, those stay
// manual/LinkedIn-sourced fields on the lead. It also never returns an email.
// Docs: https://learn.microsoft.com/en-us/rest/api/maps/search/get-search-poi

const SEARCH_URL = "https://atlas.microsoft.com/search/poi/json";
const GEOCODE_URL = "https://atlas.microsoft.com/search/address/json";
const STATIC_MAP_URL = "https://atlas.microsoft.com/map/static";

export interface PlaceResult {
  placeId: string;
  name: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  phone?: string;
  website?: string;
}

export function isConfigured(): boolean {
  return Boolean(process.env.AZURE_MAPS_KEY);
}

interface RawPosition {
  lat: number;
  lon: number;
}

interface RawAddressResult {
  position?: RawPosition;
  address?: {
    streetNumber?: string;
    streetName?: string;
    municipality?: string;
    countrySubdivisionCode?: string;
    postalCode?: string;
  };
}

interface RawPoiResult extends RawAddressResult {
  id: string;
  poi?: { name?: string; phone?: string; url?: string };
}

// Azure Maps returns bare domains like "www.example.com" with no scheme,
// so normalize the value into a usable href.
function normalizeWebsite(url?: string): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function mapResult(r: RawPoiResult): PlaceResult {
  const street = [r.address?.streetNumber, r.address?.streetName].filter(Boolean).join(" ") || undefined;
  return {
    placeId: r.id,
    name: r.poi?.name ?? "",
    street,
    city: r.address?.municipality,
    state: r.address?.countrySubdivisionCode,
    zip: r.address?.postalCode,
    lat: r.position?.lat,
    lon: r.position?.lon,
    phone: r.poi?.phone,
    website: normalizeWebsite(r.poi?.url),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Azure Maps' Search API is capped at 500 QPS on Gen2, plenty for a CSV
// import, but a large batch run with concurrent requests can still trip a
// 429 under bursty load. Retrying (honoring Retry-After when Azure sends it)
// keeps a rate-limit hiccup from being misreported as "no match found" for
// a row that was never actually looked up.
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.status !== 429 || attempt >= maxRetries) return res;
    const retryAfterSec = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
      ? retryAfterSec * 1000
      : 300 * 2 ** attempt; // 300ms, 600ms, 1200ms, ...
    await sleep(Math.min(waitMs, 5000));
  }
}

export async function searchPlacesText(query: string, limit = 5): Promise<PlaceResult[]> {
  const key = process.env.AZURE_MAPS_KEY;
  if (!key) throw new Error("not_configured");

  const url = new URL(SEARCH_URL);
  url.searchParams.set("api-version", "1.0");
  url.searchParams.set("subscription-key", key);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 100)));

  const res = await fetchWithRetry(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Azure Maps API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { results?: RawPoiResult[] };
  return (json.results ?? []).map(mapResult);
}

// Plain address geocoding (not POI/business-name search), used to place a
// lead on the embedded map when it was entered manually (no stored lat/lon
// from a prior Azure Maps enrichment).
export async function geocodeAddress(query: string): Promise<{ lat: number; lon: number } | null> {
  const key = process.env.AZURE_MAPS_KEY;
  if (!key) throw new Error("not_configured");

  const url = new URL(GEOCODE_URL);
  url.searchParams.set("api-version", "1.0");
  url.searchParams.set("subscription-key", key);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", "1");

  const res = await fetchWithRetry(url.toString());
  if (!res.ok) return null;

  const json = (await res.json()) as { results?: RawAddressResult[] };
  const position = json.results?.[0]?.position;
  return position ? { lat: position.lat, lon: position.lon } : null;
}

// Renders a small static map image (PNG) centered on a coordinate with a
// pin, for the embedded map on a lead's detail view. Called server-side only
// (app/api/leads/map-image), the subscription key never reaches the browser.
export async function getStaticMapImage(lat: number, lon: number): Promise<ArrayBuffer> {
  const key = process.env.AZURE_MAPS_KEY;
  if (!key) throw new Error("not_configured");

  const url = new URL(STATIC_MAP_URL);
  url.searchParams.set("api-version", "2024-04-01");
  url.searchParams.set("subscription-key", key);
  url.searchParams.set("zoom", "14");
  url.searchParams.set("center", `${lon},${lat}`); // Azure Maps wants lon,lat, not lat,lon
  url.searchParams.set("width", "600");
  url.searchParams.set("height", "260");
  url.searchParams.set("pins", `default||${lon} ${lat}`);

  const res = await fetchWithRetry(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Azure Maps static image error ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.arrayBuffer();
}

// Runs `fn` over `items` with at most `limit` in flight at once. Azure Maps
// has per-second rate limits, and a CSV import can be dozens/hundreds of rows.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
