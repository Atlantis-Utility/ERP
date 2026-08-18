import { NextResponse } from "next/server";
import { getPortalCustomers, isPortalConfigured } from "@/lib/ringlogix-portal";
import { listCachedCustomers } from "@/lib/db/ringlogix-customers";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  // Primary source: the DB cache kept fresh by the cron sync every 3 hours —
  // avoids a live portal login/scrape on every page load.
  try {
    const supabase = await createClient();
    const cached = await listCachedCustomers(supabase);
    if (cached.length > 0) return NextResponse.json(cached);
  } catch {
    // fall through to a live scrape below
  }

  if (!isPortalConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  try {
    const data = await getPortalCustomers();
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
