import { NextRequest, NextResponse } from "next/server";
import { getSites, getRealTopology, isConfigured } from "@/lib/unifi";

export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  try {
    const { data: sites } = await getSites();
    const site = sites.find((s) => s.siteId === siteId);
    if (!site) {
      return NextResponse.json({ available: false, devices: [], clients: [] });
    }
    const topology = await getRealTopology(site.hostId);
    return NextResponse.json(topology);
  } catch {
    // The Connector Proxy being unavailable for a given site is expected
    // (ownership-gated), not a request failure — respond 200 with available: false.
    return NextResponse.json({ available: false, devices: [], clients: [] });
  }
}
