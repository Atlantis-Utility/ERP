"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import ExportMenu from "@/components/ui/ExportMenu";
import { DollarSign, AlertCircle, RefreshCw, CheckCircle, Clock, Info, Users } from "lucide-react";

/**
 * Balances, from the only place that has them.
 *
 * Not from the API. This page used to read `reseller_client`, an object
 * RingLogix answers "Bad request. Unknown object." - billing lives in their
 * RingOS API and they list that as unavailable, so there are no invoices,
 * no line items and no billing plans to be had over the wire. What there
 * is, is the balance and credit limit on the reseller portal's own
 * customer list, which the cron sync already caches. That is what this
 * shows, and the notice below says so rather than leaving someone to
 * wonder where the invoices went.
 */

interface BillingClient {
  id: string;
  company: string;
  contact: string;
  status: string;
  balance: number;
  creditLimit: number;
}

type ViewState = "loading" | "unconfigured" | "forbidden" | "error" | "ok";

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

/** The portal says "Open" for a live account and "Terminate" for a dead one. */
function isLive(status: string) {
  return /open|active/i.test(status);
}

export default function BillingPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [clients, setClients] = useState<BillingClient[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [nonce, setNonce] = useState(0);

  // Set here rather than at the top of the effect: React's compiler rules
  // out a synchronous setState inside an effect, and a refresh always
  // starts with a click.
  const refresh = useCallback(() => {
    setState("loading");
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ringlogix/billing");
        if (cancelled) return;
        if (res.status === 503) { setState("unconfigured"); return; }
        const data = await res.json();
        if (cancelled) return;
        if (res.status === 403) { setError(data.error ?? ""); setState("forbidden"); return; }
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        setClients(data.clients ?? []);
        setNotice(data.apiBilling?.available === false ? (data.apiBilling.reason ?? "") : "");
        setState("ok");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
        setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [nonce]);

  const owed = clients.reduce((s, c) => s + c.balance, 0);
  const live = clients.filter((c) => isLive(c.status));
  // A credit limit of zero is "no limit recorded", not "no credit", so it
  // cannot count as over-limit or every prepaid account looks delinquent.
  const overLimit = clients.filter((c) => c.creditLimit > 0 && c.balance > c.creditLimit);

  const filtered = clients.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.company.toLowerCase().includes(q) ||
      c.contact.toLowerCase().includes(q) ||
      c.id.includes(q)
    );
  });

  const exportData = () => ({
    filename: "billing",
    title: "Billing",
    headers: ["Client", "Account", "Contact", "Balance", "Credit Limit", "Status"],
    rows: filtered.map((c) => [
      c.company, c.id, c.contact, usd(c.balance), usd(c.creditLimit), c.status,
    ]),
  });

  return (
    <div>
      <Header
        title="Billing"
        subtitle="Balances from the reseller portal"
        actions={
          <>
            <ExportMenu data={exportData} disabled={state !== "ok" || filtered.length === 0} />
            <button
              onClick={refresh}
              disabled={state === "loading"}
              className="flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${state === "loading" ? "animate-spin" : ""}`} />
              Sync
            </button>
          </>
        }
      />

      {state === "ok" && notice && (
        <div className="flex items-start gap-2.5 bg-[#fff7e6] border border-[#eaeaea] rounded-xl px-4 py-3 mb-6">
          <Info className="w-4 h-4 text-[#92400e] shrink-0 mt-0.5" />
          <p className="text-xs text-[#92400e] leading-relaxed">{notice}</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <DollarSign className="w-4 h-4 text-[#17c964]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? usd(owed) : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Outstanding</p>
          <p className="text-xs text-[#999]">Across every account</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <CheckCircle className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? live.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Open Accounts</p>
          <p className="text-xs text-[#999]">Still billing</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <AlertCircle className="w-4 h-4 text-[#f31260]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? overLimit.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Over Credit Limit</p>
          <p className="text-xs text-[#999]">Where a limit is recorded</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Users className="w-4 h-4 text-[#7c3aed]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? clients.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Clients</p>
          <p className="text-xs text-[#999]">On the portal list</p>
        </div>
      </div>

      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">Client Balances</p>
          <input
            type="text"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-56 outline-none focus:border-[#0070f3] transition-colors bg-white text-[#0a0a0a]"
          />
        </div>

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Loading balances…</p>
          </div>
        )}

        {state === "unconfigured" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f5a524] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">The portal login isn&apos;t configured</p>
            <p className="text-xs text-[#999]">
              Balances come from the reseller portal, so this needs{" "}
              <code className="bg-[#f1f1f1] px-1 rounded">RINGLOGIX_PORTAL_USERNAME</code> and its password.
            </p>
          </div>
        )}

        {state === "forbidden" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f5a524] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">Balances need their own permission</p>
            <p className="text-xs text-[#999]">{error}</p>
          </div>
        )}

        {state === "error" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f31260] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">Couldn&apos;t load balances</p>
            <p className="text-xs text-[#999] mb-4">{error}</p>
            <button onClick={refresh} className="text-xs text-[#0070f3] hover:underline">Retry</button>
          </div>
        )}

        {state === "ok" && filtered.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-sm text-[#999]">No clients found{search ? " for that search" : ""}.</p>
          </div>
        )}

        {state === "ok" && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-140">
              <thead>
                <tr className="border-b border-[#eaeaea]">
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Client</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Contact</th>
                  <th className="text-right text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Balance</th>
                  <th className="text-right text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Credit Limit</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const live = isLive(c.status);
                  const over = c.creditLimit > 0 && c.balance > c.creditLimit;
                  return (
                    <tr key={c.id} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-[#0a0a0a]">{c.company || c.id}</p>
                        <p className="text-[10px] text-[#999]">{c.id}</p>
                      </td>
                      <td className="px-5 py-3 text-sm text-[#666]">{c.contact || "-"}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-sm font-semibold tabular-nums ${over ? "text-[#b91c1c]" : "text-[#0a0a0a]"}`}>
                          {usd(c.balance)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-sm text-[#666] tabular-nums">
                        {c.creditLimit > 0 ? usd(c.creditLimit) : "-"}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            live ? "bg-[#f0fdf4] text-[#15803d]" : "bg-[#f5f5f5] text-[#666]"
                          }`}
                        >
                          {live ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {c.status || "Unknown"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
