import { NextRequest, NextResponse } from "next/server";
import { getDialplans, isConfigured } from "@/lib/ringlogix";

export async function GET(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const domain = req.nextUrl.searchParams.get("domain") ?? undefined;
  try {
    const data = await getDialplans(domain);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
