"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { subscribeTable } from "../supabase/realtime";

const TABLE = "vendor_contacts";

// Support contacts for the companies we buy from — who to call when a circuit
// drops or a shipment is late. Distinct from the Contacts page, which is
// RingLogix's per-customer address book.
//
// Company-wide data: every authenticated user reads it, admins write it
// (gated in the UI, like the rest of the app — the Supabase policy only
// requires a session).
export type VendorCategory = "ISP" | "Carrier" | "Hardware" | "Software" | "Other";

export const VENDOR_CATEGORIES: VendorCategory[] = [
  "ISP",
  "Carrier",
  "Hardware",
  "Software",
  "Other",
];

export interface VendorContact {
  id: string;
  company: string;
  category: VendorCategory;
  website: string;
  /** Billing/account portal we actually log into. */
  portal: string;
  /** General support line — the number you call at 2am. */
  supportPhone: string;
  supportEmail: string;
  /** Our account number with them, as printed on the invoice. */
  accountNumber: string;
  /** Named point of contact: our rep at this vendor. */
  pocName: string;
  pocTitle: string;
  pocPhone: string;
  pocEmail: string;
  notes: string;
  /** Filename of a bundled logo asset, when we ship one for this vendor. */
  logoFile: string;
  /** Which /public directory logoFile lives in. */
  logoDir: string;
  /** Circular logos need clipping so they don't render as a square. */
  logoRounded: boolean;
  /**
   * Bare domain for the Clearbit logo fallback. Usually left empty —
   * vendorLogoDomain() derives it from `website`.
   */
  domain: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The domain to pull a logo from when we don't ship a bundled asset. Falls back
 * to the website's hostname so a vendor an admin adds by hand still gets a real
 * logo instead of a generic icon, without asking them for a second field.
 */
export function vendorLogoDomain(c: VendorContact): string | undefined {
  const explicit = c.domain?.trim();
  if (explicit) return explicit;

  const site = c.website?.trim();
  if (!site) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`);
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return undefined;
  }
}

interface Row { id: string; data: VendorContact }
const fromRow = (row: Row): VendorContact => ({ ...row.data, id: row.id });

function withTimeout<T>(promise: PromiseLike<T>, ms = 12_000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Request timed out. Check your connection and try again.")),
        ms
      )
    ),
  ]);
}

async function fetchAll(): Promise<VendorContact[]> {
  const { data, error } = await supabase.from(TABLE).select("id, data").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as Row[])
    .map(fromRow)
    .sort((a, b) => a.company.localeCompare(b.company));
}

export function subscribeVendorContacts(cb: (contacts: VendorContact[]) => void) {
  return subscribeTable(TABLE, fetchAll, cb);
}

export function useVendorContacts(): VendorContact[] {
  const [list, setList] = useState<VendorContact[]>([]);
  useEffect(() => subscribeVendorContacts(setList), []);
  return list;
}

export function emptyVendorContact(): VendorContact {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    company: "",
    category: "ISP",
    website: "",
    portal: "",
    supportPhone: "",
    supportEmail: "",
    accountNumber: "",
    pocName: "",
    pocTitle: "",
    pocPhone: "",
    pocEmail: "",
    notes: "",
    logoFile: "",
    // Superset of the logo assets we ship — the Quick Access links pull from
    // here too, so a vendor listed in both places uses the same artwork.
    logoDir: "quick-access-logos",
    logoRounded: false,
    domain: "",
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveVendorContact(contact: VendorContact): Promise<void> {
  const updated: VendorContact = { ...contact, updatedAt: new Date().toISOString() };
  const { error } = await withTimeout(
    supabase.from(TABLE).upsert({ id: updated.id, updated_at: updated.updatedAt, data: updated })
  );
  if (error) throw error;
}

export async function removeVendorContact(id: string): Promise<void> {
  const { error } = await withTimeout(supabase.from(TABLE).delete().eq("id", id));
  if (error) throw error;
}

// ── Seed ───────────────────────────────────────────────────────────────────

// The ISPs and carriers we actually buy from, matching the "ISPs & Carriers"
// section of the Quick Access links. Only fields we can source from the repo
// are filled in: the phone/email for Advantage WISP and Lytwave come from
// lib/isp-accounts.ts (transcribed off their invoices), and the portal URLs
// from the Quick Access list. Support numbers for the rest are deliberately
// left blank rather than guessed — a wrong number during an outage is worse
// than an empty field. Fill them in from the Contacts tab.
type SeedVendor = Pick<
  VendorContact,
  "company" | "category" | "website" | "portal" | "supportPhone" | "supportEmail" | "accountNumber" | "logoFile" | "domain"
>;

export const VENDOR_SEED: SeedVendor[] = [
  {
    company: "Advantage WISP",
    category: "ISP",
    website: "https://advantagewisp.com",
    portal: "https://myaccount.advantagewisp.com/account-manager/",
    supportPhone: "(805) 500-8081",
    supportEmail: "billing@advantagewisp.com",
    accountNumber: "alankosh · customer 1463261",
    logoFile: "advantagewisp.png",
    domain: "advantagewisp.com",
  },
  {
    company: "Lytwave",
    category: "ISP",
    website: "https://lytwave.com",
    portal: "https://pay.lytwave.com/dashboard/history",
    supportPhone: "(805) 866-5678",
    supportEmail: "customerservice@lytwave.com",
    accountNumber: "Alan Kosh · Atlantis Utility",
    logoFile: "lytwave.png",
    domain: "lytwave.com",
  },
  {
    company: "Frontier",
    category: "ISP",
    website: "https://frontier.com",
    portal: "https://frontier.com",
    supportPhone: "",
    supportEmail: "",
    accountNumber: "",
    logoFile: "frontier.png",
    domain: "frontier.com",
  },
  {
    company: "Spectrum Business",
    category: "ISP",
    website: "https://www.spectrumbusiness.net",
    portal: "https://www.spectrumbusiness.net",
    supportPhone: "",
    supportEmail: "",
    accountNumber: "",
    logoFile: "spectrum.png",
    domain: "spectrum.com",
  },
  {
    company: "AT&T Business",
    category: "ISP",
    website: "https://att.com",
    portal: "https://att.com",
    supportPhone: "",
    supportEmail: "",
    accountNumber: "",
    logoFile: "att.png",
    domain: "att.com",
  },
  {
    company: "T-Mobile Business",
    category: "Carrier",
    website: "https://www.t-mobile.com/business",
    portal: "https://tfb.t-mobile.com/apps/tfb_billing/dashboard",
    supportPhone: "",
    supportEmail: "",
    accountNumber: "",
    logoFile: "tmobile.png",
    domain: "t-mobile.com",
  },
  {
    company: "Telnyx",
    category: "Carrier",
    website: "https://telnyx.com",
    portal: "https://portal.telnyx.com",
    supportPhone: "",
    supportEmail: "",
    accountNumber: "",
    logoFile: "telnyx.png",
    domain: "telnyx.com",
  },
  {
    // The hosted PBX platform the whole Customers/Subscribers side runs on.
    // `portal` is our reseller dashboard, not ringlogix.com's marketing site.
    company: "RingLogix",
    category: "Software",
    website: "https://ringlogix.com",
    portal: "https://atlantisutility.simplelogin.net",
    supportPhone: "",
    supportEmail: "",
    accountNumber: "",
    logoFile: "ringlogix.png",
    domain: "ringlogix.com",
  },
];

/**
 * Inserts any seed vendor that isn't already present, matched on company name.
 * Idempotent, so running it twice won't duplicate rows and it can be used to
 * top up the list after a new provider is added to VENDOR_SEED.
 *
 * @returns how many rows were created.
 */
export async function seedVendorContacts(existing: VendorContact[]): Promise<number> {
  const have = new Set(existing.map((c) => c.company.trim().toLowerCase()));
  const missing = VENDOR_SEED.filter((s) => !have.has(s.company.trim().toLowerCase()));
  if (missing.length === 0) return 0;

  const now = new Date().toISOString();
  const rows = missing.map((s) => {
    const contact: VendorContact = {
      ...emptyVendorContact(),
      ...s,
      createdAt: now,
      updatedAt: now,
    };
    return { id: contact.id, updated_at: now, data: contact };
  });

  const { error } = await withTimeout(supabase.from(TABLE).upsert(rows));
  if (error) throw error;
  return rows.length;
}
