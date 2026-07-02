import { NextRequest, NextResponse } from "next/server";
import { getDeviceModels, isConfigured } from "@/lib/ringlogix";

export async function GET(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const p = req.nextUrl.searchParams;
  try {
    const data = await getDeviceModels({
      brand: p.get("brand") ?? undefined,
      model: p.get("model") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
