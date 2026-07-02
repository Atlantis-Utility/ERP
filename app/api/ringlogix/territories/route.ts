import { NextResponse } from "next/server";
import { getTerritories, isConfigured } from "@/lib/ringlogix";

export async function GET() {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    const data = await getTerritories();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
