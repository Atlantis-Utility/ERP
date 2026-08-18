import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalCustomer } from "../ringlogix-portal";

// Server-only reads/writes of the ringlogix_customers cache table — mirrors
// the shape of PortalCustomer from lib/ringlogix-portal.ts so callers don't
// need to know whether the data came from a live scrape or the DB cache.
const TABLE = "ringlogix_customers";

function fromRow(row: Record<string, unknown>): PortalCustomer {
  return {
    id: row.id as string,
    parentId: (row.parent_id as string) ?? "",
    company: (row.company as string) ?? "",
    contact: (row.contact as string) ?? "",
    email: (row.email as string) ?? "",
    phone: (row.phone as string) ?? "",
    status: (row.status as string) ?? "",
    balance: (row.balance as string) ?? "",
    creditLimit: (row.credit_limit as string) ?? "",
  };
}

export async function listCachedCustomers(supabase: SupabaseClient): Promise<PortalCustomer[]> {
  const { data, error } = await supabase.from(TABLE).select("*").order("company");
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

// Upserts the given customers as one sync run, then prunes any row not part
// of this run (i.e. a customer that disappeared from the portal).
export async function replaceCachedCustomers(
  supabase: SupabaseClient,
  customers: PortalCustomer[],
): Promise<{ count: number; syncedAt: string }> {
  const syncedAt = new Date().toISOString();

  if (customers.length > 0) {
    const { error } = await supabase.from(TABLE).upsert(
      customers.map((c) => ({
        id: c.id,
        parent_id: c.parentId,
        company: c.company,
        contact: c.contact,
        email: c.email,
        phone: c.phone,
        status: c.status,
        balance: c.balance,
        credit_limit: c.creditLimit,
        synced_at: syncedAt,
      })),
    );
    if (error) throw error;
  }

  const { error: deleteError } = await supabase.from(TABLE).delete().lt("synced_at", syncedAt);
  if (deleteError) throw deleteError;

  return { count: customers.length, syncedAt };
}
