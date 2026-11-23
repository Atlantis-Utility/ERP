import { NextRequest, NextResponse } from "next/server";
import { getDeviceModels, isConfigured } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { denyUnlessEmployee } from "@/lib/ringlogix-guard";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessEmployee();
  if (denied) return denied;

  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const p = req.nextUrl.searchParams;
  try {
    const data = await getDeviceModels({
      brand: p.get("brand") ?? undefined,
      model: p.get("model") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    return ringlogixFailure(err);
  }
}
