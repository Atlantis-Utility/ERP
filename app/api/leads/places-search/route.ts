import { NextRequest, NextResponse } from "next/server";
import { isConfigured, searchPlacesText } from "@/lib/azure-maps";

// Discover panel on the Leads page: free-text search (e.g. "HVAC contractors
// in Boston, MA") against Azure Maps, returning candidate businesses to save
// as leads directly.
export async function GET(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  try {
    const places = await searchPlacesText(q, 20);
    return NextResponse.json({ places });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
