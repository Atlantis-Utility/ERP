import { NextRequest, NextResponse } from "next/server";
import { isConfigured, geocodeAddress, getStaticMapImage } from "@/lib/azure-maps";

// Embedded map image for the lead detail drawer. Prefers a stored lat/lon
// (already known from a prior Azure Maps enrichment) and falls back to
// geocoding a free-text address (manually-entered leads have no coordinates
// on file yet). The subscription key stays server-side either way, the
// browser only ever sees this route's URL.
export async function GET(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const p = req.nextUrl.searchParams;
  const latParam = p.get("lat");
  const lonParam = p.get("lon");
  const address = p.get("address");

  try {
    let lat = latParam ? Number(latParam) : undefined;
    let lon = lonParam ? Number(lonParam) : undefined;

    if ((lat === undefined || lon === undefined || Number.isNaN(lat) || Number.isNaN(lon)) && address) {
      const pos = await geocodeAddress(address);
      if (!pos) return NextResponse.json({ error: "Address not found" }, { status: 404 });
      lat = pos.lat;
      lon = pos.lon;
    }

    if (lat === undefined || lon === undefined || Number.isNaN(lat) || Number.isNaN(lon)) {
      return NextResponse.json({ error: "Missing lat/lon or address" }, { status: 400 });
    }

    const image = await getStaticMapImage(lat, lon);
    return new NextResponse(image, {
      headers: {
        "Content-Type": "image/png",
        // A business's location rarely changes, cache aggressively so
        // reopening the same lead doesn't re-hit Azure Maps every time.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
