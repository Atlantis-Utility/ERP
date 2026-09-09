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

// One static IP the customer holds. UniFi reports a WAN's IPv4 address but no
// netmask/gateway/DNS, so everything past `ip` is hand-entered — blank is a
// normal state here, not missing data.
export interface StaticIpConfig {
  id: string;
  ip: string;
  subnetMask: string;
  gateway: string;
  dnsPrimary: string;
  dnsSecondary: string;
  label: string; // which circuit it belongs to, e.g. "Lytwave WAN1"
  notes: string;
}

export interface CustomerProfileOverlay {
  customerId: string;
  isp: string;
  backupIsp: string;
  contacts: CustomerContact[]; // custom contacts only — the RingLogix-sourced default contact isn't stored here
  mainContactId: string; // DEFAULT_CONTACT_ID or a contact's id
  staticIps: StaticIpConfig[];
  updatedAt: string;
  updatedBy?: string;
}

export function newStaticIp(overrides: Partial<StaticIpConfig> = {}): StaticIpConfig {
  return {
    id: `ip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ip: "",
    subnetMask: "",
    gateway: "",
    dnsPrimary: "",
    dnsSecondary: "",
    label: "",
    notes: "",
    ...overrides,
  };
}

/** True once anything beyond the generated id has been filled in. */
export function hasStaticIpDetail(s: StaticIpConfig): boolean {
  return Boolean(s.ip || s.subnetMask || s.gateway || s.dnsPrimary || s.dnsSecondary || s.label || s.notes);
}

function fromRow(row: Record<string, unknown>): CustomerProfileOverlay {
  return {
    customerId: row.customer_id as string,
    isp: (row.isp as string) ?? "",
    backupIsp: (row.backup_isp as string) ?? "",
    contacts: (row.contacts as CustomerContact[]) ?? [],
    mainContactId: (row.main_contact_id as string) ?? DEFAULT_CONTACT_ID,
    staticIps: (row.static_ips as StaticIpConfig[]) ?? [],
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
  overlay: {
    isp: string;
    backupIsp: string;
    contacts: CustomerContact[];
    mainContactId: string;
    // Required, not optional: this is a full-row upsert, so a caller that
    // forgets it would silently wipe the customer's saved static IPs.
    staticIps: StaticIpConfig[];
  },
  updatedBy?: string,
): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert({
    customer_id: customerId,
    isp: overlay.isp || null,
    backup_isp: overlay.backupIsp || null,
    contacts: overlay.contacts,
    main_contact_id: overlay.mainContactId,
    static_ips: overlay.staticIps,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  });
  if (error) throw error;
}
