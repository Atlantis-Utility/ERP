import { NextRequest, NextResponse } from "next/server";
import { getDIDs, isConfigured } from "@/lib/ringlogix";

export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const domain = req.nextUrl.searchParams.get("domain") ?? undefined;
  try {
    const data = await getDIDs(domain);
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
