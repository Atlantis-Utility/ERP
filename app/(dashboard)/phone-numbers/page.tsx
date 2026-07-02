"use client";

import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { Phone, PhoneIncoming, PhoneOff, RefreshCw, AlertCircle } from "lucide-react";

interface RLDid {
  did: string;
  domain?: string;
  subscriber?: string;
  description?: string;
  type?: string;
  status?: string;
  territory?: string;
}

type ViewState = "loading" | "unconfigured" | "error" | "ok";

function formatNumber(n: string) {
  const d = n.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) {
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return n;
}

export default function PhoneNumbersPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [dids, setDids] = useState<RLDid[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load(silent = false) {
    if (!silent) setState("loading");
    try {
      const res = await fetch("/api/ringlogix/dids");
      if (res.status === 503) { if (!silent) setState("unconfigured"); return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      const arr: RLDid[] = Array.isArray(data) ? data : (data.data ?? []);
      setDids(arr);
      setState("ok");
      try { localStorage.setItem("sc:dids", JSON.stringify(arr)); } catch {}
    } catch (e) {
      if (!silent) { setError(e instanceof Error ? e.message : "Failed to load"); setState("error"); }
    }
  }

  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:dids");
      if (c) { setDids(JSON.parse(c)); setState("ok"); load(true); }
      else load();
    } catch { load(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assigned = dids.filter((d) => d.subscriber || d.domain);
  const unassigned = dids.filter((d) => !d.subscriber && !d.domain);

  const filtered = dids.filter((d) => {
    const q = search.toLowerCase();
    return (
      d.did?.toLowerCase().includes(q) ||
      d.domain?.toLowerCase().includes(q) ||
      d.subscriber?.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <Header
        title="Phone Numbers"
        subtitle="DID inventory from RingLogix"
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
            <Phone className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">{state === "ok" ? dids.length : "-"}</p>
          <p className="text-sm text-[#666] mb-1">Total DIDs</p>
          <p className="text-xs text-[#999]">All phone numbers</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <PhoneIncoming className="w-4 h-4 text-[#17c964]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">{state === "ok" ? assigned.length : "-"}</p>
          <p className="text-sm text-[#666] mb-1">Assigned</p>
          <p className="text-xs text-[#17c964] font-medium">In use</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <PhoneOff className="w-4 h-4 text-[#f5a524]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">{state === "ok" ? unassigned.length : "-"}</p>
          <p className="text-sm text-[#666] mb-1">Unassigned</p>
          <p className="text-xs text-[#f5a524] font-medium">Available</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Phone className="w-4 h-4 text-[#7c3aed]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? new Set(dids.map((d) => d.domain).filter(Boolean)).size : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Customers</p>
          <p className="text-xs text-[#999]">With DIDs assigned</p>
        </div>
      </div>

      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">DID Inventory</p>
          <input
            type="text"
            placeholder="Search numbers or accounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-64 outline-none focus:border-[#0070f3] transition-colors"
          />
        </div>

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Loading phone numbers…</p>
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
            <button onClick={load} className="text-xs text-[#0070f3] hover:underline">Retry</button>
          </div>
        )}

        {state === "ok" && filtered.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-sm text-[#999]">No phone numbers found{search ? " for that search" : ""}.</p>
          </div>
        )}

        {state === "ok" && filtered.length > 0 && (
          <div className="overflow-x-auto">
          <table className="w-full min-w-140">
            <thead>
              <tr className="border-b border-[#eaeaea]">
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Phone Number</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Customer Account</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Assigned To</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Type</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => {
                const isAssigned = Boolean(d.subscriber || d.domain);
                return (
                  <tr key={d.did + i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-[#999] shrink-0" />
                        <span className="text-sm font-medium text-[#0a0a0a] font-mono">{formatNumber(d.did)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-[#666]">{d.domain || "-"}</td>
                    <td className="px-5 py-3 text-sm text-[#666]">{d.subscriber || "-"}</td>
                    <td className="px-5 py-3 text-sm text-[#666] capitalize">{d.type || "direct"}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${isAssigned ? "bg-[#e8fdf0] text-[#17c964]" : "bg-[#f1f1f1] text-[#666]"}`}>
                        {isAssigned ? "Assigned" : "Available"}
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
