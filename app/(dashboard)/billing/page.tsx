"use client";

import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { DollarSign, TrendingUp, AlertCircle, RefreshCw, CheckCircle, Clock } from "lucide-react";

interface RLClient {
  domain?: string;
  reseller_client?: string;
  name?: string;
  description?: string;
  balance?: string;
  credit_limit?: string;
  billing_plan?: string;
  status?: string;
  invoice_count?: string;
}

type ViewState = "loading" | "unconfigured" | "error" | "ok";

function formatUSD(val: string | undefined) {
  const n = parseFloat(val ?? "0");
  if (isNaN(n)) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function BillingPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [clients, setClients] = useState<RLClient[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load(silent = false) {
    if (!silent) setState("loading");
    try {
      const res = await fetch("/api/ringlogix/billing");
      if (res.status === 503) { if (!silent) setState("unconfigured"); return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      const arr: RLClient[] = Array.isArray(data) ? data : (data.data ?? []);
      setClients(arr);
      setState("ok");
      try { localStorage.setItem("sc:billing", JSON.stringify(arr)); } catch {}
    } catch (e) {
      if (!silent) { setError(e instanceof Error ? e.message : "Failed to load"); setState("error"); }
    }
  }

  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:billing");
      if (c) { setClients(JSON.parse(c)); setState("ok"); load(true); }
      else load();
    } catch { load(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalBalance = clients.reduce((s, c) => s + parseFloat(c.balance ?? "0"), 0);
  const overdue = clients.filter((c) => parseFloat(c.balance ?? "0") > parseFloat(c.credit_limit ?? "9999999"));
  const active = clients.filter((c) => !c.status || c.status === "active");

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.domain?.toLowerCase().includes(q) ||
      c.name?.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.billing_plan?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <Header
        title="Billing"
        subtitle="RingLogix reseller billing"
        actions={
          <button
            onClick={() => load()}
            disabled={state === "loading"}
            className="flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${state === "loading" ? "animate-spin" : ""}`} />
            Sync
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <DollarSign className="w-4 h-4 text-[#17c964]" />
          </div>
          <p className="text-3xl font-semibold text-[#17c964] leading-none mb-1">
            {state === "ok" ? formatUSD(totalBalance.toFixed(2)) : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Outstanding</p>
          <p className="text-xs text-[#999]">Across all accounts</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <CheckCircle className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">{state === "ok" ? active.length : "-"}</p>
          <p className="text-sm text-[#666] mb-1">Active Accounts</p>
          <p className="text-xs text-[#17c964] font-medium">Billing normally</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <AlertCircle className="w-4 h-4 text-[#f31260]" />
          </div>
          <p className="text-3xl font-semibold text-[#f31260] leading-none mb-1">{state === "ok" ? overdue.length : "-"}</p>
          <p className="text-sm text-[#666] mb-1">Over Credit Limit</p>
          <p className="text-xs text-[#f31260] font-medium">Needs attention</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <TrendingUp className="w-4 h-4 text-[#7c3aed]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">{state === "ok" ? clients.length : "-"}</p>
          <p className="text-sm text-[#666] mb-1">Total Clients</p>
          <p className="text-xs text-[#999]">On billing</p>
        </div>
      </div>

      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">Client Billing</p>
          <input
            type="text"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-56 outline-none focus:border-[#0070f3] transition-colors"
          />
        </div>

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Loading billing data…</p>
          </div>
        )}

        {state === "unconfigured" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f5a524] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">API key not configured</p>
            <p className="text-xs text-[#999]">Add <code className="bg-[#f1f1f1] px-1 rounded">RINGLOGIX_API_ID & RINGLOGIX_API_SECRET</code> to <code className="bg-[#f1f1f1] px-1 rounded">.env.local</code> and restart.</p>
          </div>
        )}

        {state === "error" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f31260] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">Failed to load</p>
            <p className="text-xs text-[#999] mb-4">{error}</p>
            <button onClick={() => load()} className="text-xs text-[#0070f3] hover:underline">Retry</button>
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
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Billing Plan</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Balance</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Credit Limit</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const isActive = !c.status || c.status === "active";
                const bal = parseFloat(c.balance ?? "0");
                const lim = parseFloat(c.credit_limit ?? "9999999");
                const overLimit = bal > lim;
                return (
                  <tr key={(c.domain ?? "") + i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-[#0a0a0a]">{c.name || c.domain || "-"}</p>
                      {c.domain && c.name && <p className="text-[10px] text-[#999]">{c.domain}</p>}
                    </td>
                    <td className="px-5 py-3 text-sm text-[#666]">{c.billing_plan || "-"}</td>
                    <td className="px-5 py-3">
                      <span className={`text-sm font-semibold ${overLimit ? "text-[#f31260]" : "text-[#0a0a0a]"}`}>
                        {formatUSD(c.balance)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-[#666]">{formatUSD(c.credit_limit)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${isActive ? "bg-[#e8fdf0] text-[#17c964]" : "bg-[#f1f1f1] text-[#666]"}`}>
                        {isActive ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {isActive ? "Active" : (c.status ?? "Unknown")}
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
