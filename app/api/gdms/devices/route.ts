import { NextResponse } from "next/server";
import { isConfigured, missingConfig, getAllDevices } from "@/lib/gdms";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "not_configured", missing: missingConfig() },
      { status: 503 },
    );
  }

  try {
    const devices = await getAllDevices();
    return NextResponse.json({ data: devices });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
