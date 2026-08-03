import { NextResponse } from "next/server";
import { getPortalCustomers, isPortalConfigured } from "@/lib/ringlogix-portal";

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

    return NextResponse.json({ customer });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
