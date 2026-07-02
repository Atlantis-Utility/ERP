import { NextRequest, NextResponse } from "next/server";
import { getRecordings, isConfigured } from "@/lib/ringlogix";

export async function GET(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { searchParams } = req.nextUrl;
  try {
    const data = await getRecordings({
      domain: searchParams.get("domain") ?? undefined,
      limit:  searchParams.get("limit")  ?? "100",
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
