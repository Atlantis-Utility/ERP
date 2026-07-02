"use client";

import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { Mic, Clock, Building2, BarChart, RefreshCw, AlertCircle } from "lucide-react";

interface RLRecording {
  recording?: string;
  domain?: string;
  subscriber?: string;
  filename?: string;
  duration?: string;
  start_time?: string;
  orig_from_user?: string;
  dest_to_user?: string;
  size?: string;
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

export default function RecordingsPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [recordings, setRecordings] = useState<RLRecording[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load(silent = false) {
    if (!silent) setState("loading");
    try {
      const res = await fetch("/api/ringlogix/recordings");
      if (res.status === 503) { if (!silent) setState("unconfigured"); return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      const arr: RLRecording[] = Array.isArray(data) ? data : (data.data ?? []);
      setRecordings(arr);
      setState("ok");
      try { localStorage.setItem("sc:recordings", JSON.stringify(arr)); } catch {}
    } catch (e) {
      if (!silent) { setError(e instanceof Error ? e.message : "Failed to load"); setState("error"); }
    }
  }

  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:recordings");
      if (c) { setRecordings(JSON.parse(c)); setState("ok"); load(true); }
      else load();
    } catch { load(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalSeconds = recordings.reduce((s, r) => s + parseInt(r.duration ?? "0", 10), 0);
  const totalHours = (totalSeconds / 3600).toFixed(1);
  const uniqueDomains = new Set(recordings.map((r) => r.domain).filter(Boolean)).size;
  const avgDuration = recordings.length > 0 ? Math.round(totalSeconds / recordings.length) : 0;

  const filtered = recordings.filter((r) => {
    const term = search.toLowerCase();
    return (
      r.recording?.toLowerCase().includes(term) ||
      r.domain?.toLowerCase().includes(term) ||
      r.subscriber?.toLowerCase().includes(term) ||
      r.orig_from_user?.toLowerCase().includes(term) ||
      r.dest_to_user?.toLowerCase().includes(term) ||
      r.filename?.toLowerCase().includes(term)
    );
  });

  return (
    <div>
      <Header
        title="Recordings"
        subtitle="Call recordings from RingLogix"
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
            <Mic className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? recordings.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Recordings</p>
          <p className="text-xs text-[#999]">All recorded calls</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Clock className="w-4 h-4 text-[#17c964]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? `${totalHours}h` : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Duration</p>
          <p className="text-xs text-[#999]">{state === "ok" ? `${totalSeconds} seconds` : "-"}</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Building2 className="w-4 h-4 text-[#7c3aed]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? uniqueDomains : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Unique Domains</p>
          <p className="text-xs text-[#999]">Customer accounts</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <BarChart className="w-4 h-4 text-[#f5a524]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? avgDuration : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Avg Duration</p>
          <p className="text-xs text-[#999]">Seconds per recording</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">All Recordings</p>
          <input
            type="text"
            placeholder="Search recordings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-56 outline-none focus:border-[#0070f3] transition-colors"
          />
        </div>

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Loading recordings…</p>
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

        {state === "ok" && recordings.length === 0 && (
          <div className="p-12 text-center">
            <Mic className="w-6 h-6 text-[#999] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">No recordings found</p>
            <p className="text-xs text-[#999]">This feature may not be enabled on your RingLogix plan.</p>
          </div>
        )}

        {state === "ok" && recordings.length > 0 && filtered.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-sm text-[#999]">No recordings found for that search.</p>
          </div>
        )}

        {state === "ok" && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-140">
              <thead>
                <tr className="border-b border-[#eaeaea]">
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Recording ID</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Customer</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Extension</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">From → To</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Duration</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={(r.recording ?? "") + i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#e8f2ff] flex items-center justify-center shrink-0">
                          <Mic className="w-3.5 h-3.5 text-[#0070f3]" />
                        </div>
                        <span className="text-sm font-medium text-[#0a0a0a] font-mono">{r.recording || "-"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-[#666]">{r.domain || "-"}</td>
                    <td className="px-5 py-3 text-sm font-mono text-[#666]">{r.subscriber || "-"}</td>
                    <td className="px-5 py-3">
                      <span className="text-sm font-mono text-[#0a0a0a]">{r.orig_from_user || "-"}</span>
                      <span className="text-sm text-[#999] mx-1">→</span>
                      <span className="text-sm font-mono text-[#0a0a0a]">{r.dest_to_user || "-"}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-[#666]">{formatDuration(r.duration)}</td>
                    <td className="px-5 py-3 text-xs text-[#666]">{formatTime(r.start_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
