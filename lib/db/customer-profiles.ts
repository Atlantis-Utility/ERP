"use client";

import { supabase } from "../supabase/client";

// Editable ISP/contacts overlay for a RingLogix customer (domain id).
// Customers have no local DB record of their own (they're fetched live from
// RingLogix), so this is a standalone overlay table keyed by that domain id —
// same pattern as lib/db/unifi-links.ts.
const TABLE = "customer_profiles";

export const DEFAULT_CONTACT_ID = "default";

export interface CustomerContact {
  id: string;
  name: string;
  designation: string;
  email: string;
  phone: string;
}

export interface CustomerProfileOverlay {
  customerId: string;
  isp: string;
  backupIsp: string;
  contacts: CustomerContact[]; // custom contacts only — the RingLogix-sourced default contact isn't stored here
  mainContactId: string; // DEFAULT_CONTACT_ID or a contact's id
  updatedAt: string;
  updatedBy?: string;
}

function fromRow(row: Record<string, unknown>): CustomerProfileOverlay {
  return {
    customerId: row.customer_id as string,
    isp: (row.isp as string) ?? "",
    backupIsp: (row.backup_isp as string) ?? "",
    contacts: (row.contacts as CustomerContact[]) ?? [],
    mainContactId: (row.main_contact_id as string) ?? DEFAULT_CONTACT_ID,
    updatedAt: row.updated_at as string,
    updatedBy: (row.updated_by as string) ?? undefined,
  };
}

export async function getCustomerProfile(customerId: string): Promise<CustomerProfileOverlay | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

export async function setCustomerProfile(
  customerId: string,
  overlay: { isp: string; backupIsp: string; contacts: CustomerContact[]; mainContactId: string },
  updatedBy?: string,
): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert({
    customer_id: customerId,
    isp: overlay.isp || null,
    backup_isp: overlay.backupIsp || null,
    contacts: overlay.contacts,
    main_contact_id: overlay.mainContactId,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  });
  if (error) throw error;
}
