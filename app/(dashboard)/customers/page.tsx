"use client";

import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { Building2, Users, Phone, RefreshCw, AlertCircle, CheckCircle, Clock } from "lucide-react";

interface RLDomain {
  domain: string;
  description?: string;
  count_subscribers?: string;
  territory?: string;
  status?: string;
  reseller?: string;
}

type ViewState = "loading" | "unconfigured" | "error" | "ok";

function formatDomain(d: string) {
  return d.replace(/\.$/, "");
}

export default function CustomersPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [customers, setCustomers] = useState<RLDomain[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load(silent = false) {
    if (!silent) setState("loading");
    try {
      const res = await fetch("/api/ringlogix/customers");
      if (res.status === 503) { if (!silent) setState("unconfigured"); return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      const arr: RLDomain[] = Array.isArray(data) ? data : (data.data ?? []);
      setCustomers(arr);
      setState("ok");
      try { localStorage.setItem("sc:customers", JSON.stringify(arr)); } catch {}
    } catch (e) {
      if (!silent) { setError(e instanceof Error ? e.message : "Failed to load"); setState("error"); }
    }
  }

  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:customers");
      if (c) { setCustomers(JSON.parse(c)); setState("ok"); load(true); }
      else load();
    } catch { load(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.domain?.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.territory?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <Header
        title="Customers"
        subtitle="RingLogix account directory"
        actions={
          <button
            onClick={load}
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
            <Building2 className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? customers.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Customers</p>
          <p className="text-xs text-[#999]">All RingLogix accounts</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <CheckCircle className="w-4 h-4 text-[#17c964]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? customers.filter((c) => !c.status || c.status === "active").length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Active</p>
          <p className="text-xs text-[#17c964] font-medium">In service</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Users className="w-4 h-4 text-[#7c3aed]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok"
              ? customers.reduce((s, c) => s + parseInt(c.count_subscribers ?? "0", 10), 0)
              : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Extensions</p>
          <p className="text-xs text-[#999]">Across all accounts</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Phone className="w-4 h-4 text-[#f5a524]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok"
              ? new Set(customers.map((c) => c.territory).filter(Boolean)).size || "-"
              : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Territories</p>
          <p className="text-xs text-[#999]">Regions served</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">All Customers</p>
          <input
            type="text"
            placeholder="Search accounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-56 outline-none focus:border-[#0070f3] transition-colors"
          />
        </div>

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Syncing from RingLogix…</p>
          </div>
        )}

        {state === "unconfigured" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f5a524] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">API key not configured</p>
            <p className="text-xs text-[#999]">Add your key to <code className="bg-[#f1f1f1] px-1 rounded">.env.local</code> as <code className="bg-[#f1f1f1] px-1 rounded">RINGLOGIX_API_ID & RINGLOGIX_API_SECRET</code>, then restart the server.</p>
          </div>
        )}

        {state === "error" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f31260] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">Failed to load</p>
            <p className="text-xs text-[#999] mb-4">{error}</p>
            <button onClick={load} className="text-xs text-[#0070f3] hover:underline">Retry</button>
          </div>
        )}

        {state === "ok" && filtered.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-sm text-[#999]">No customers found{search ? " for that search" : ""}.</p>
          </div>
        )}

        {state === "ok" && filtered.length > 0 && (
          <div className="overflow-x-auto">
          <table className="w-full min-w-140">
            <thead>
              <tr className="border-b border-[#eaeaea]">
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Account / Domain</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Description</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Territory</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Extensions</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isActive = !c.status || c.status === "active";
                return (
                  <tr key={c.domain} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#e8f2ff] flex items-center justify-center shrink-0">
                          <Building2 className="w-3.5 h-3.5 text-[#0070f3]" />
                        </div>
                        <span className="text-sm font-medium text-[#0a0a0a]">{formatDomain(c.domain)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-[#666]">{c.description || "-"}</td>
                    <td className="px-5 py-3 text-sm text-[#666]">{c.territory || "-"}</td>
                    <td className="px-5 py-3 text-sm text-[#666]">{c.count_subscribers ?? "-"}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${isActive ? "bg-[#e8fdf0] text-[#17c964]" : "bg-[#fff8e6] text-[#f5a524]"}`}>
                        <Clock className="w-3 h-3" />
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
