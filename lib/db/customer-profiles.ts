"use client";

import { supabase } from "../supabase/client";
import { emptyHours, normalizeHours, type CustomerHours } from "../customer-hours";

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

/**
 * An account a provider bills a customer's circuit under.
 *
 * The number you quote when you ring them. Kept as a list because one
 * customer can hold several - Harborwalk has two Spectrum accounts at the
 * same address, and a primary and a backup circuit are billed separately.
 */
export interface IspAccount {
  id: string;
  /** "Spectrum", "Frontier" - matched to a Quick Access vendor by name. */
  provider: string;
  accountNumber: string;
  /**
   * The address as the provider bills it, kept only when it differs from
   * the customer's own. Their bills carry company names that are not the
   * customer's, and the address is what proves the match.
   */
  serviceAddress: string;
  notes: string;
}

export function newIspAccount(overrides: Partial<IspAccount> = {}): IspAccount {
  return {
    id: `isp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    provider: "",
    accountNumber: "",
    serviceAddress: "",
    notes: "",
    ...overrides,
  };
}

/** True once anything beyond the generated id has been filled in. */
export function hasIspAccountDetail(a: IspAccount): boolean {
  return Boolean(a.provider.trim() || a.accountNumber.trim() || a.serviceAddress.trim() || a.notes.trim());
}

export interface CustomerProfileOverlay {
  customerId: string;
  isp: string;
  backupIsp: string;
  /**
   * Where the customer actually is, and their own site. Neither comes from
   * RingLogix: the API's `domain` object (which holds the service address) is
   * 403 for our credentials, so both are kept here, seeded from a researched
   * list in supabase/migration-customer-address-website.sql. Blank is a
   * normal state, and reads as blank rather than as "not on file".
   */
  address: string;
  website: string;
  contacts: CustomerContact[]; // custom contacts only — the RingLogix-sourced default contact isn't stored here
  mainContactId: string; // DEFAULT_CONTACT_ID or a contact's id
  staticIps: StaticIpConfig[];
  /** What each provider bills this customer's circuits under. */
  ispAccounts: IspAccount[];
  /**
   * When they're open, typed in by hand. Nothing fills these automatically:
   * see lib/customer-hours.ts. Requires supabase/migration-customer-hours.sql.
   */
  hours: CustomerHours;
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
    address: (row.address as string) ?? "",
    website: (row.website as string) ?? "",
    contacts: (row.contacts as CustomerContact[]) ?? [],
    mainContactId: (row.main_contact_id as string) ?? DEFAULT_CONTACT_ID,
    staticIps: (row.static_ips as StaticIpConfig[]) ?? [],
    ispAccounts: (row.isp_accounts as IspAccount[]) ?? [],
    hours: normalizeHours(row.hours),
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
    address: string;
    website: string;
    contacts: CustomerContact[];
    mainContactId: string;
    // Required, not optional: this is a full-row upsert, so a caller that
    // forgets it would silently wipe the customer's saved static IPs.
    staticIps: StaticIpConfig[];
    /** Required for the same reason. */
    ispAccounts: IspAccount[];
    /** Required for the same reason. */
    hours: CustomerHours;
  },
  updatedBy?: string,
): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert({
    customer_id: customerId,
    isp: overlay.isp || null,
    backup_isp: overlay.backupIsp || null,
    address: overlay.address || null,
    website: overlay.website || null,
    contacts: overlay.contacts,
    main_contact_id: overlay.mainContactId,
    static_ips: overlay.staticIps,
    isp_accounts: overlay.ispAccounts ?? [],
    hours: overlay.hours ?? emptyHours(),
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  });
  if (error) throw error;
}
