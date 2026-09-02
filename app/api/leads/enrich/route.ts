import { NextRequest, NextResponse } from "next/server";
import { isConfigured, searchPlacesText, mapWithConcurrency, type PlaceResult } from "@/lib/azure-maps";

interface EnrichRow {
  id: string; // client-side row id, echoed back so the UI can match results to rows
  companyName: string;
  location?: string;
}

interface EnrichResult {
  id: string;
  matched: boolean;
  place: PlaceResult | null;
  error?: string;
}

const MAX_ROWS = 200;

// Takes CSV-imported rows (company name + location, e.g. from a LinkedIn
// Sales Navigator export) and looks each one up in Azure Maps to fill in
// website and phone. No email/company-size/rating fields come back, Azure
// Maps doesn't have them.
export async function POST(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  let body: { rows?: EnrichRow[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rows = body.rows ?? [];
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Max ${MAX_ROWS} rows per batch` }, { status: 400 });
  }

  const results: EnrichResult[] = await mapWithConcurrency(rows, 5, async (row): Promise<EnrichResult> => {
    const query = [row.companyName, row.location].filter(Boolean).join(" ").trim();
    if (!query) return { id: row.id, matched: false, place: null, error: "Missing company name" };
    try {
      const [match] = await searchPlacesText(query, 1);
      return { id: row.id, matched: Boolean(match), place: match ?? null };
    } catch (err) {
      return { id: row.id, matched: false, place: null, error: String(err) };
    }
  });

  return NextResponse.json({ results });
}
