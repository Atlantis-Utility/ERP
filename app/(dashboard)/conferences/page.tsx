"use client";

import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { Video, Building2, Shield, CheckCircle, RefreshCw, AlertCircle } from "lucide-react";

interface RLConference {
  conference?: string;
  domain?: string;
  description?: string;
  pin?: string;
  max_participants?: string;
  status?: string;
  type?: string;
}

type ViewState = "loading" | "unconfigured" | "error" | "ok";

function maskPin(pin: string | undefined) {
  if (!pin) return "-";
  if (pin.length <= 2) return "*".repeat(pin.length);
  return pin.slice(0, 1) + "*".repeat(pin.length - 2) + pin.slice(-1);
}

export default function ConferencesPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [conferences, setConferences] = useState<RLConference[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load(silent = false) {
    if (!silent) setState("loading");
    try {
      const res = await fetch("/api/ringlogix/conferences");
      if (res.status === 503) { if (!silent) setState("unconfigured"); return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      const arr: RLConference[] = Array.isArray(data) ? data : (data.data ?? []);
      setConferences(arr);
      setState("ok");
      try { localStorage.setItem("sc:conferences", JSON.stringify(arr)); } catch {}
    } catch (e) {
      if (!silent) { setError(e instanceof Error ? e.message : "Failed to load"); setState("error"); }
    }
  }

  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:conferences");
      if (c) { setConferences(JSON.parse(c)); setState("ok"); load(true); }
      else load();
    } catch { load(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uniqueDomains = new Set(conferences.map((c) => c.domain).filter(Boolean)).size;
  const withPin = conferences.filter((c) => c.pin && c.pin.trim() !== "").length;
  const available = conferences.filter((c) => !c.status || c.status === "active" || c.status === "available").length;

  const filtered = conferences.filter((c) => {
    const term = search.toLowerCase();
    return (
      c.conference?.toLowerCase().includes(term) ||
      c.domain?.toLowerCase().includes(term) ||
      c.description?.toLowerCase().includes(term) ||
      c.type?.toLowerCase().includes(term)
    );
  });

  return (
    <div>
      <Header
        title="Conferences"
        subtitle="Conference rooms from RingLogix"
        actions={
          <button
            onClick={() => load()}
            disabled={state === "loading"}
            className="flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${state === "loading" ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Video className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? conferences.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Rooms</p>
          <p className="text-xs text-[#999]">All conference rooms</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Building2 className="w-4 h-4 text-[#17c964]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? uniqueDomains : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Unique Domains</p>
          <p className="text-xs text-[#999]">Customer accounts</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Shield className="w-4 h-4 text-[#7c3aed]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? withPin : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">With PIN</p>
          <p className="text-xs text-[#999]">PIN-protected rooms</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <CheckCircle className="w-4 h-4 text-[#f5a524]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? available : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Available</p>
          <p className="text-xs text-[#999]">Ready for use</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">All Conference Rooms</p>
          <input
            type="text"
            placeholder="Search rooms…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-56 outline-none focus:border-[#0070f3] transition-colors"
          />
        </div>

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Loading conference rooms…</p>
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
            <p className="text-sm text-[#999]">No conference rooms found{search ? " for that search" : ""}.</p>
          </div>
        )}

        {state === "ok" && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-140">
              <thead>
                <tr className="border-b border-[#eaeaea]">
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Room ID</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Customer Account</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Description</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">PIN</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Max Participants</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => {
                  const isActive = !c.status || c.status === "active" || c.status === "available";
                  return (
                    <tr key={(c.conference ?? "") + i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#e8f2ff] flex items-center justify-center shrink-0">
                            <Video className="w-3.5 h-3.5 text-[#0070f3]" />
                          </div>
                          <span className="text-sm font-medium text-[#0a0a0a]">{c.conference || "-"}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-[#666]">{c.domain || "-"}</td>
                      <td className="px-5 py-3 text-sm text-[#666]">{c.description || "-"}</td>
                      <td className="px-5 py-3">
                        {c.pin ? (
                          <span className="inline-flex items-center gap-1 text-sm font-mono text-[#666]">
                            <Shield className="w-3 h-3 text-[#7c3aed]" />
                            {maskPin(c.pin)}
                          </span>
                        ) : (
                          <span className="text-sm text-[#999]">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-[#666]">{c.max_participants || "-"}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${isActive ? "bg-[#e8fdf0] text-[#17c964]" : "bg-[#fff8e6] text-[#f5a524]"}`}>
                          <CheckCircle className="w-3 h-3" />
                          {isActive ? "Available" : (c.status ?? "Unknown")}
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
