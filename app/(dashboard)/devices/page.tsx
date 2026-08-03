"use client";

import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { Laptop, Building2, Monitor, Users, RefreshCw, AlertCircle } from "lucide-react";

interface RLDevice {
  device?: string;
  domain?: string;
  subscriber?: string;
  description?: string;
  model?: string;
  type?: string;
  status?: string;
  config?: string;
  territory?: string;
}

type ViewState = "loading" | "unconfigured" | "error" | "ok";

function modelDisplay(d: RLDevice) {
  if (d.model && d.type) return `${d.model} (${d.type})`;
  return d.model || d.type || "-";
}

export default function DevicesPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [devices, setDevices] = useState<RLDevice[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load(silent = false) {
    if (!silent) setState("loading");
    try {
      const res = await fetch("/api/ringlogix/devices");
      if (res.status === 503) { if (!silent) setState("unconfigured"); return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      const arr: RLDevice[] = Array.isArray(data) ? data : (data.data ?? []);
      setDevices(arr);
      setState("ok");
      try { localStorage.setItem("sc:devices", JSON.stringify(arr)); } catch {}
    } catch (e) {
      if (!silent) { setError(e instanceof Error ? e.message : "Failed to load"); setState("error"); }
    }
  }

  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:devices");
      if (c) { setDevices(JSON.parse(c)); setState("ok"); load(true); }
      else load();
    } catch { load(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uniqueDomains = new Set(devices.map((d) => d.domain).filter(Boolean)).size;
  const uniqueModels = new Set(devices.map((d) => d.model || d.type).filter(Boolean)).size;
  const withSubscriber = devices.filter((d) => Boolean(d.subscriber)).length;

  const filtered = devices.filter((d) => {
    const q = search.toLowerCase();
    return (
      d.device?.toLowerCase().includes(q) ||
      d.domain?.toLowerCase().includes(q) ||
      d.subscriber?.toLowerCase().includes(q) ||
      d.model?.toLowerCase().includes(q) ||
      d.type?.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <Header
        title="Devices"
        subtitle="SIP device inventory from RingLogix"
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
            <Laptop className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? devices.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Devices</p>
          <p className="text-xs text-[#999]">All SIP endpoints</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Building2 className="w-4 h-4 text-[#17c964]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? uniqueDomains : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Customers</p>
          <p className="text-xs text-[#17c964] font-medium">Unique accounts</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Monitor className="w-4 h-4 text-[#7c3aed]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? uniqueModels : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Models</p>
          <p className="text-xs text-[#999]">Unique device types</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Users className="w-4 h-4 text-[#f5a524]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? withSubscriber : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Assigned</p>
          <p className="text-xs text-[#999]">With subscriber</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">Device Inventory</p>
          <input
            type="text"
            placeholder="Search devices or accounts…"
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
            <p className="text-sm text-[#999]">No devices found{search ? " for that search" : ""}.</p>
          </div>
        )}

        {state === "ok" && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-140">
              <thead>
                <tr className="border-b border-[#eaeaea]">
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Device ID</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Model / Type</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Customer Account</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Subscriber</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => {
                  const isProvisioned = Boolean(d.subscriber);
                  return (
                    <tr key={(d.device ?? "") + (d.domain ?? "") + i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#e8f2ff] flex items-center justify-center shrink-0">
                            <Laptop className="w-3.5 h-3.5 text-[#0070f3]" />
                          </div>
                          <span className="text-sm font-medium text-[#0a0a0a] font-mono">{d.device || "-"}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-[#666] capitalize">{modelDisplay(d)}</td>
                      <td className="px-5 py-3 text-sm text-[#666]">{d.domain || "-"}</td>
                      <td className="px-5 py-3 text-sm text-[#666] font-mono">{d.subscriber || "-"}</td>
                      <td className="px-5 py-3">
                        {d.status ? (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#f1f1f1] text-[#666] capitalize">
                            {d.status}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${isProvisioned ? "bg-[#e8fdf0] text-[#17c964]" : "bg-[#f1f1f1] text-[#666]"}`}>
                            {isProvisioned ? "Provisioned" : "Unassigned"}
                          </span>
                        )}
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
