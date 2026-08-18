import { NextRequest, NextResponse } from "next/server";
import { fetchFreshPortalCustomers, isPortalConfigured } from "@/lib/ringlogix-portal";
import { replaceCachedCustomers } from "@/lib/db/ringlogix-customers";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const maxDuration = 60;

// Triggered by the Vercel cron in vercel.json every 3 hours. Vercel attaches
// `Authorization: Bearer $CRON_SECRET` automatically when that env var is set
// on the project — set it there (and here) so this can't be triggered by
// anyone who finds the URL.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — allow (dev/local)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isPortalConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  try {
    const customers = await fetchFreshPortalCustomers();
    const supabase = createServiceRoleClient();
    const { count, syncedAt } = await replaceCachedCustomers(supabase, customers);
    return NextResponse.json({ ok: true, count, syncedAt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
