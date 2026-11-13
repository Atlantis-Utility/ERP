import { NextResponse } from "next/server";
import { getTerritories, isConfigured } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";

export async function GET() {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    const data = await getTerritories();
    return NextResponse.json(data);
  } catch (err) {
    return ringlogixFailure(err);
  }
}
