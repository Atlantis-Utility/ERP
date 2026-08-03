"use client";

import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { Users, CheckCircle, Phone, Building2, RefreshCw, AlertCircle } from "lucide-react";

interface RLSubscriber {
  subscriber?: string;
  domain?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  status?: string;
  scope?: string;
  did?: string;
  territory?: string;
}

type ViewState = "loading" | "unconfigured" | "error" | "ok";

function displayName(s: RLSubscriber) {
  if (s.first_name || s.last_name) {
    return [s.first_name, s.last_name].filter(Boolean).join(" ");
  }
  return s.name || "-";
}

export default function SubscribersPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [subscribers, setSubscribers] = useState<RLSubscriber[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load(silent = false) {
    if (!silent) setState("loading");
    try {
      const res = await fetch("/api/ringlogix/subscribers");
      if (res.status === 503) { if (!silent) setState("unconfigured"); return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      const arr: RLSubscriber[] = Array.isArray(data) ? data : (data.data ?? []);
      setSubscribers(arr);
      setState("ok");
      try { localStorage.setItem("sc:subscribers", JSON.stringify(arr)); } catch {}
    } catch (e) {
      if (!silent) { setError(e instanceof Error ? e.message : "Failed to load"); setState("error"); }
    }
  }

  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:subscribers");
      if (c) { setSubscribers(JSON.parse(c)); setState("ok"); load(true); }
      else load();
    } catch { load(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enabledCount = subscribers.filter((s) => s.status === "enabled" || !s.status).length;
  const withDid = subscribers.filter((s) => Boolean(s.did)).length;
  const uniqueDomains = new Set(subscribers.map((s) => s.domain).filter(Boolean)).size;

  const filtered = subscribers.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.subscriber?.toLowerCase().includes(q) ||
      s.domain?.toLowerCase().includes(q) ||
      s.first_name?.toLowerCase().includes(q) ||
      s.last_name?.toLowerCase().includes(q) ||
      s.name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.did?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <Header
        title="Subscribers"
        subtitle="Extensions across all RingLogix accounts"
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
            <Users className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? subscribers.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Subscribers</p>
          <p className="text-xs text-[#999]">All extensions</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <CheckCircle className="w-4 h-4 text-[#17c964]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? enabledCount : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Enabled</p>
          <p className="text-xs text-[#17c964] font-medium">Active extensions</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Phone className="w-4 h-4 text-[#7c3aed]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? withDid : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">With DID</p>
          <p className="text-xs text-[#999]">DID assigned</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Building2 className="w-4 h-4 text-[#f5a524]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? uniqueDomains : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Customers</p>
          <p className="text-xs text-[#999]">Unique accounts</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">All Subscribers</p>
          <input
            type="text"
            placeholder="Search extensions or accounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-64 outline-none focus:border-[#0070f3] transition-colors"
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
            <button onClick={() => load()} className="text-xs text-[#0070f3] hover:underline">Retry</button>
          </div>
        )}

        {state === "ok" && filtered.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-sm text-[#999]">No subscribers found{search ? " for that search" : ""}.</p>
          </div>
        )}

        {state === "ok" && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-140">
              <thead>
                <tr className="border-b border-[#eaeaea]">
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Extension</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Name</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Customer Account</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Email</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">DID</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const isEnabled = s.status === "enabled" || !s.status;
                  return (
                    <tr key={(s.subscriber ?? "") + (s.domain ?? "") + i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#e8f2ff] flex items-center justify-center shrink-0">
                            <Users className="w-3.5 h-3.5 text-[#0070f3]" />
                          </div>
                          <span className="text-sm font-medium text-[#0a0a0a] font-mono">{s.subscriber || "-"}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-[#666]">{displayName(s)}</td>
                      <td className="px-5 py-3 text-sm text-[#666]">{s.domain || "-"}</td>
                      <td className="px-5 py-3 text-sm text-[#666]">{s.email || "-"}</td>
                      <td className="px-5 py-3 text-sm text-[#666] font-mono">{s.did || "-"}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${isEnabled ? "bg-[#e8fdf0] text-[#17c964]" : "bg-[#fff1f2] text-[#f31260]"}`}>
                          {isEnabled ? "Enabled" : (s.status ?? "Disabled")}
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
