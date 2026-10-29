"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { sameIsp } from "../isp-match";

/**
 * Which of our customers are on which provider.
 *
 * Quick Access held the support number for Lytwave and no way to answer the
 * question you ring Lytwave about: which of our customers is this going to
 * affect. The answer is already on file - each customer's overlay carries
 * the ISP somebody typed - it had just never been read from the other end.
 *
 * Primary and backup are kept apart. A provider that is somebody's failover
 * matters differently from one carrying their only circuit, and an outage
 * conversation goes differently too.
 */
export interface IspAccount {
  customerId: string;
  company: string;
  /** The ISP exactly as it is written on that customer. */
  asWritten: string;
}

export interface IspAccounts {
  primary: IspAccount[];
  backup: IspAccount[];
}

const EMPTY: IspAccounts = { primary: [], backup: [] };

interface Row {
  customerId: string;
  company: string;
  isp: string;
  backupIsp: string;
}

export interface IspAccountsState {
  /** Every customer with an ISP recorded, for matching against a vendor. */
  rows: Row[];
  loading: boolean;
  /** How many customers have no ISP on file, so the UI can say so. */
  withoutIsp: number;
}

export function useIspAccounts(): IspAccountsState {
  const [state, setState] = useState<IspAccountsState>({ rows: [], loading: true, withoutIsp: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [profiles, customers] = await Promise.all([
          supabase.from("customer_profiles").select("customer_id, isp, backup_isp"),
          supabase.from("ringlogix_customers").select("id, company"),
        ]);
        if (profiles.error || customers.error) throw profiles.error ?? customers.error;

        const names = new Map(
          (customers.data as { id: string; company: string | null }[]).map((c) => [c.id, c.company ?? c.id]),
        );
        const rows: Row[] = [];
        let withoutIsp = 0;
        for (const p of profiles.data as { customer_id: string; isp: string | null; backup_isp: string | null }[]) {
          const isp = (p.isp ?? "").trim();
          const backupIsp = (p.backup_isp ?? "").trim();
          if (!isp && !backupIsp) {
            withoutIsp++;
            continue;
          }
          rows.push({
            customerId: p.customer_id,
            // A customer the portal no longer lists still has an overlay
            // row; showing the id beats dropping them silently.
            company: names.get(p.customer_id) ?? p.customer_id,
            isp,
            backupIsp,
          });
        }
        // Customers with no overlay row at all have no ISP either.
        withoutIsp += Math.max(0, names.size - (profiles.data as unknown[]).length);
        if (!cancelled) setState({ rows, loading: false, withoutIsp });
      } catch {
        if (!cancelled) setState({ rows: [], loading: false, withoutIsp: 0 });
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** The customers on one provider, by the vendor record's own name. */
export function accountsFor(rows: Row[], vendorName: string): IspAccounts {
  if (!vendorName.trim()) return EMPTY;
  const primary: IspAccount[] = [];
  const backup: IspAccount[] = [];
  for (const r of rows) {
    if (r.isp && sameIsp(r.isp, vendorName)) {
      primary.push({ customerId: r.customerId, company: r.company, asWritten: r.isp });
    } else if (r.backupIsp && sameIsp(r.backupIsp, vendorName)) {
      backup.push({ customerId: r.customerId, company: r.company, asWritten: r.backupIsp });
    }
  }
  const byName = (a: IspAccount, b: IspAccount) => a.company.localeCompare(b.company);
  return { primary: primary.sort(byName), backup: backup.sort(byName) };
}
