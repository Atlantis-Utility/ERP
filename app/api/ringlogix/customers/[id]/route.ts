import { NextResponse } from "next/server";
import { getPortalCustomers, isPortalConfigured } from "@/lib/ringlogix-portal";
import { callerHasPageOption } from "@/lib/page-options-server";
import { CUSTOMER_BILLING } from "@/lib/page-options";

// Devices/subscribers/DIDs/queues are fetched by the frontend directly from
// their own endpoints (each tab loads independently) — this route only needs
// to resolve the fast, cached portal customer record.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isPortalConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  try {
    const customers = await getPortalCustomers();
    const customer = customers.find((c) => c.id === id);
    if (!customer) {
      return NextResponse.json({ error: "customer_not_found" }, { status: 404 });
    }

    // Same rule as the list route: money is granted separately from the
    // page, so it leaves the server only for somebody who holds it.
    if (await callerHasPageOption(CUSTOMER_BILLING)) {
      return NextResponse.json({ customer });
    }
    return NextResponse.json({ customer: { ...customer, balance: "", creditLimit: "" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
