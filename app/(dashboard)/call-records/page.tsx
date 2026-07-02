"use client";

import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { PhoneCall, PhoneIncoming, PhoneOutgoing, Clock, RefreshCw, AlertCircle } from "lucide-react";

interface RLCDR {
  callid?: string;
  domain?: string;
  start_time?: string;
  answer_time?: string;
  release_time?: string;
  duration?: string;
  orig_from_user?: string;
  orig_from_name?: string;
  dest_to_user?: string;
  direction?: string;
  final_status?: string;
  leg_type?: string;
}

type ViewState = "loading" | "unconfigured" | "error" | "ok";

function formatDuration(seconds: string | undefined) {
  if (!seconds) return "-";
  const s = parseInt(seconds, 10);
  if (isNaN(s)) return "-";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatTime(t: string | undefined) {
  if (!t) return "-";
  try {
    return new Date(t).toLocaleString("en-US", {
      month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch {
    return t;
  }
}

function formatNumber(n: string | undefined) {
  if (!n) return "-";
  const d = n.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return n;
}

export default function CallRecordsPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [cdrs, setCdrs] = useState<RLCDR[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load(silent = false) {
    if (!silent) setState("loading");
    try {
      const res = await fetch("/api/ringlogix/cdr?limit=200");
      if (res.status === 503) { if (!silent) setState("unconfigured"); return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      const arr: RLCDR[] = Array.isArray(data) ? data : (data.data ?? []);
      setCdrs(arr);
      setState("ok");
      try { localStorage.setItem("sc:cdr", JSON.stringify(arr)); } catch {}
    } catch (e) {
      if (!silent) { setError(e instanceof Error ? e.message : "Failed to load"); setState("error"); }
    }
  }

  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:cdr");
      if (c) { setCdrs(JSON.parse(c)); setState("ok"); load(true); }
      else load();
    } catch { load(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inbound = cdrs.filter((c) => c.direction === "inbound" || c.leg_type === "orig");
  const outbound = cdrs.filter((c) => c.direction === "outbound" || c.leg_type === "term");
  const totalMin = cdrs.reduce((s, c) => s + parseInt(c.duration ?? "0", 10), 0);

  const filtered = cdrs.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.domain?.toLowerCase().includes(q) ||
      c.orig_from_user?.toLowerCase().includes(q) ||
      c.dest_to_user?.toLowerCase().includes(q) ||
      c.orig_from_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <Header
        title="Call Records"
        subtitle="CDR data from RingLogix"
        actions={
          <button
            onClick={load}
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
            <PhoneCall className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">{state === "ok" ? cdrs.length : "-"}</p>
          <p className="text-sm text-[#666] mb-1">Total Calls</p>
          <p className="text-xs text-[#999]">In current view</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <PhoneIncoming className="w-4 h-4 text-[#17c964]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">{state === "ok" ? inbound.length : "-"}</p>
          <p className="text-sm text-[#666] mb-1">Inbound</p>
          <p className="text-xs text-[#17c964] font-medium">Received calls</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <PhoneOutgoing className="w-4 h-4 text-[#7c3aed]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">{state === "ok" ? outbound.length : "-"}</p>
          <p className="text-sm text-[#666] mb-1">Outbound</p>
          <p className="text-xs text-[#999]">Placed calls</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Clock className="w-4 h-4 text-[#f5a524]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? `${Math.floor(totalMin / 60)}h` : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Duration</p>
          <p className="text-xs text-[#999]">{state === "ok" ? `${totalMin} seconds` : "-"}</p>
        </div>
      </div>

      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">Call Log</p>
          <input
            type="text"
            placeholder="Search by number or account…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-64 outline-none focus:border-[#0070f3] transition-colors"
          />
        </div>

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Loading call records…</p>
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
            <p className="text-sm text-[#999]">No records found{search ? " for that search" : ""}.</p>
          </div>
        )}

        {state === "ok" && filtered.length > 0 && (
          <div className="overflow-x-auto">
          <table className="w-full min-w-140">
            <thead>
              <tr className="border-b border-[#eaeaea]">
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Time</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">From</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">To</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Account</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Duration</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Direction</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const isIn = c.direction === "inbound" || c.leg_type === "orig";
                return (
                  <tr key={(c.callid ?? "") + i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                    <td className="px-5 py-3 text-xs text-[#666]">{formatTime(c.start_time)}</td>
                    <td className="px-5 py-3">
                      <p className="text-sm font-mono text-[#0a0a0a]">{formatNumber(c.orig_from_user)}</p>
                      {c.orig_from_name && <p className="text-[10px] text-[#999]">{c.orig_from_name}</p>}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-[#0a0a0a]">{formatNumber(c.dest_to_user)}</td>
                    <td className="px-5 py-3 text-sm text-[#666]">{c.domain || "-"}</td>
                    <td className="px-5 py-3 text-sm text-[#666]">{formatDuration(c.duration)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${isIn ? "bg-[#e8fdf0] text-[#17c964]" : "bg-[#e8f2ff] text-[#0070f3]"}`}>
                        {isIn ? <PhoneIncoming className="w-3 h-3" /> : <PhoneOutgoing className="w-3 h-3" />}
                        {isIn ? "Inbound" : "Outbound"}
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
