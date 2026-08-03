"use client";

import { supabase } from "../supabase/client";

// Links a RingLogix customer (domain id) to its UniFi Site Manager site.
// Customers have no local DB record of their own (they're fetched live from
// RingLogix), so this is a standalone overlay table keyed by that domain id —
// same pattern as the tickets metadata overlay in lib/db/tickets.ts.
const TABLE = "customer_unifi_sites";

export interface CustomerUnifiLink {
  customerId: string;
  siteId: string;
  hostId: string;
  siteName?: string;
  linkedAt: string;
  linkedBy?: string;
}

function fromRow(row: Record<string, unknown>): CustomerUnifiLink {
  return {
    customerId: row.customer_id as string,
    siteId: row.site_id as string,
    hostId: row.host_id as string,
    siteName: (row.site_name as string) ?? undefined,
    linkedAt: row.linked_at as string,
    linkedBy: (row.linked_by as string) ?? undefined,
  };
}

export async function getUnifiLink(customerId: string): Promise<CustomerUnifiLink | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

export async function listUnifiLinks(): Promise<CustomerUnifiLink[]> {
  const { data, error } = await supabase.from(TABLE).select("*");
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function setUnifiLink(
  customerId: string,
  site: { siteId: string; hostId: string; siteName?: string },
  linkedBy?: string,
): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert({
    customer_id: customerId,
    site_id: site.siteId,
    host_id: site.hostId,
    site_name: site.siteName ?? null,
    linked_at: new Date().toISOString(),
    linked_by: linkedBy ?? null,
  });
  if (error) throw error;
}

export async function removeUnifiLink(customerId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("customer_id", customerId);
  if (error) throw error;
}
