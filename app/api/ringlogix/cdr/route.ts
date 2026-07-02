import { NextRequest, NextResponse } from "next/server";
import { getCDRs, isConfigured } from "@/lib/ringlogix";

export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const { searchParams } = req.nextUrl;
  try {
    const data = await getCDRs({
      domain: searchParams.get("domain") ?? undefined,
      limit: searchParams.get("limit") ?? "100",
      startDate: searchParams.get("start") ?? undefined,
      endDate: searchParams.get("end") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
