import { NextResponse } from "next/server";
import { BILLING_UNAVAILABLE } from "@/lib/ringlogix";
import { getPortalCustomers, isPortalConfigured } from "@/lib/ringlogix-portal";
import { listCachedCustomers } from "@/lib/db/ringlogix-customers";
import { createClient } from "@/lib/supabase/server";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { denyUnlessEmployee } from "@/lib/ringlogix-guard";
import { callerHasPageOption } from "@/lib/page-options-server";
import { CUSTOMER_BILLING } from "@/lib/page-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What we can actually tell you about money.
 *
 * Not the API. This used to call `reseller_client/read`, which is answered
 * "Bad request. Unknown object." - the object does not exist, and never
 * did; RingLogix put billing in their RingOS API and list that as
 * unavailable. There are no invoices, no line items and no commissions to
 * be had over the wire.
 *
 * What does exist is the balance and credit limit on the reseller portal's
 * own customer list, which lib/ringlogix-portal.ts already scrapes and the
 * cron sync already caches. That is served here, with `apiBilling` saying
 * plainly that the richer thing is not available - so the page can explain
 * itself rather than show an empty table.
 */
export async function GET() {
  const denied = await denyUnlessEmployee();
  if (denied) return denied;

  // The balance is a separate grant from the page itself; without it there
  // is nothing on this route worth serving.
  const allowed = await callerHasPageOption(CUSTOMER_BILLING);
  if (!allowed) {
    return NextResponse.json(
      { error: "Balances are a separate permission; ask an administrator for the billing option." },
      { status: 403 },
    );
  }

  try {
    let customers = [] as Awaited<ReturnType<typeof getPortalCustomers>>;
    try {
      const supabase = await createClient();
      customers = await listCachedCustomers(supabase);
    } catch {
      // fall through to a live scrape
    }
    if (customers.length === 0) {
      if (!isPortalConfigured()) {
        return NextResponse.json({ error: "not_configured" }, { status: 503 });
      }
      customers = await getPortalCustomers();
    }

    const money = (v: string) => Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0;

    return NextResponse.json({
      source: "portal",
      apiBilling: { available: false, reason: BILLING_UNAVAILABLE },
      clients: customers.map((c) => ({
        id: c.id,
        company: c.company,
        contact: c.contact,
        status: c.status,
        balance: money(c.balance),
        creditLimit: money(c.creditLimit),
      })),
    });
  } catch (err) {
    return ringlogixFailure(err);
  }
}
