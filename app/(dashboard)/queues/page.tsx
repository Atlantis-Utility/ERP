"use client";

import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { ListFilter, Building2, CheckCircle, Clock, RefreshCw, AlertCircle } from "lucide-react";

interface RLQueue {
  queue?: string;
  domain?: string;
  description?: string;
  strategy?: string;
  timeout?: string;
  maxlen?: string;
  members?: string;
  status?: string;
}

type ViewState = "loading" | "unconfigured" | "error" | "ok";

export default function QueuesPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [queues, setQueues] = useState<RLQueue[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load(silent = false) {
    if (!silent) setState("loading");
    try {
      const res = await fetch("/api/ringlogix/queues");
      if (res.status === 503) { if (!silent) setState("unconfigured"); return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      const arr: RLQueue[] = Array.isArray(data) ? data : (data.data ?? []);
      setQueues(arr);
      setState("ok");
      try { localStorage.setItem("sc:queues", JSON.stringify(arr)); } catch {}
    } catch (e) {
      if (!silent) { setError(e instanceof Error ? e.message : "Failed to load"); setState("error"); }
    }
  }

  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:queues");
      if (c) { setQueues(JSON.parse(c)); setState("ok"); load(true); }
      else load();
    } catch { load(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uniqueDomains = new Set(queues.map((q) => q.domain).filter(Boolean)).size;
  const activeCount = queues.filter((q) => !q.status || q.status === "active").length;
  const totalTimeout = queues.reduce((s, q) => s + parseInt(q.timeout ?? "0", 10), 0);
  const avgTimeout = queues.length > 0 ? Math.round(totalTimeout / queues.length) : 0;

  const filtered = queues.filter((q) => {
    const term = search.toLowerCase();
    return (
      q.queue?.toLowerCase().includes(term) ||
      q.domain?.toLowerCase().includes(term) ||
      q.description?.toLowerCase().includes(term) ||
      q.strategy?.toLowerCase().includes(term)
    );
  });

  return (
    <div>
      <Header
        title="Call Queues"
        subtitle="Hunt groups and call queues from RingLogix"
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
            <ListFilter className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? queues.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Queues</p>
          <p className="text-xs text-[#999]">All call queues</p>
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
            <CheckCircle className="w-4 h-4 text-[#7c3aed]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? activeCount : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Active</p>
          <p className="text-xs text-[#999]">Currently in service</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Clock className="w-4 h-4 text-[#f5a524]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? avgTimeout : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Avg Timeout</p>
          <p className="text-xs text-[#999]">Seconds before giving up</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">All Queues</p>
          <input
            type="text"
            placeholder="Search queues…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-56 outline-none focus:border-[#0070f3] transition-colors"
          />
        </div>

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Loading call queues…</p>
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
            <p className="text-sm text-[#999]">No queues found{search ? " for that search" : ""}.</p>
          </div>
        )}

        {state === "ok" && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-140">
              <thead>
                <tr className="border-b border-[#eaeaea]">
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Queue</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Customer Account</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Strategy</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Timeout</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Max Length</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Members</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q, i) => (
                  <tr key={(q.queue ?? "") + i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#e8f2ff] flex items-center justify-center shrink-0">
                          <ListFilter className="w-3.5 h-3.5 text-[#0070f3]" />
                        </div>
                        <span className="text-sm font-medium text-[#0a0a0a]">{q.queue || "-"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-[#666]">{q.domain || "-"}</td>
                    <td className="px-5 py-3">
                      {q.strategy ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#f1f1f1] text-[#666]">
                          {q.strategy}
                        </span>
                      ) : (
                        <span className="text-sm text-[#999]">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-[#666]">{q.timeout ? `${q.timeout}s` : "-"}</td>
                    <td className="px-5 py-3 text-sm text-[#666]">{q.maxlen || "-"}</td>
                    <td className="px-5 py-3 text-sm text-[#666]">{q.members || "-"}</td>
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
