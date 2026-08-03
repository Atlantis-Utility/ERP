import { NextResponse } from "next/server";
import { getPortalCustomers, isPortalConfigured } from "@/lib/ringlogix-portal";

export async function GET() {
  if (!isPortalConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  try {
    const data = await getPortalCustomers();
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
