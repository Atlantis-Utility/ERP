import { NextResponse } from "next/server";
import { getPortalCustomers, isPortalConfigured } from "@/lib/ringlogix-portal";
import { listCachedCustomers } from "@/lib/db/ringlogix-customers";
import { createClient } from "@/lib/supabase/server";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { callerHasPageOption } from "@/lib/page-options-server";
import { CUSTOMER_BILLING } from "@/lib/page-options";
import type { PortalCustomer } from "@/lib/ringlogix-portal";

// The balance and the credit limit are a separate grant from the page
// (lib/page-options.ts), and withholding a column in the browser leaves
// the number in the response for anyone who opens the network tab. So
// whoever isn't allowed to see it is served a record without it.
function withoutBilling(customers: PortalCustomer[]): PortalCustomer[] {
  return customers.map((c) => ({ ...c, balance: "", creditLimit: "" }));
}

export async function GET() {
  const billing = await callerHasPageOption(CUSTOMER_BILLING);
  const serve = (customers: PortalCustomer[]) =>
    NextResponse.json(billing ? customers : withoutBilling(customers));

  // Primary source: the DB cache kept fresh by the cron sync every 3 hours —
  // avoids a live portal login/scrape on every page load.
  try {
    const supabase = await createClient();
    const cached = await listCachedCustomers(supabase);
    if (cached.length > 0) return serve(cached);
  } catch {
    // fall through to a live scrape below
  }

  if (!isPortalConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  try {
    const data = await getPortalCustomers();
    return serve(data);
  } catch (err) {
    return ringlogixFailure(err);
  }
}
