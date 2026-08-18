import { NextResponse } from "next/server";
import { isConfigured, getOrganizations, getSites, getDevices } from "@/lib/gdms";
import type { GdmsDevice } from "@/lib/gdms";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  try {
    const orgs = await getOrganizations();
    const devices: GdmsDevice[] = [];
    for (const org of orgs) {
      const sites = await getSites(org.id);
      for (const site of sites) {
        devices.push(...(await getDevices(site.id)));
      }
    }
    return NextResponse.json({ data: devices });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "GDMS_NOT_IMPLEMENTED") {
      return NextResponse.json({ error: "not_implemented" }, { status: 501 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
