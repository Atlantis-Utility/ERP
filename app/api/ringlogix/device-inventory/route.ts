import { NextRequest, NextResponse } from "next/server";
import { getDeviceInventory, isConfigured } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";

export async function GET(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const domain = req.nextUrl.searchParams.get("domain") ?? undefined;
  try {
    const data = await getDeviceInventory(domain);
    return NextResponse.json(data);
  } catch (err) {
    return ringlogixFailure(err);
  }
}
