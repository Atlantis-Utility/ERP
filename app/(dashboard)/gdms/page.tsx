"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Header from "@/components/layout/Header";
import { RefreshCw, AlertCircle, Laptop } from "lucide-react";
import type { GdmsDevice, GdmsDeviceStatus } from "@/lib/gdms";

type ViewState = "loading" | "unconfigured" | "error" | "ok";
type StatusFilter = "all" | GdmsDeviceStatus;

const STATUS_STYLES: Record<GdmsDeviceStatus, string> = {
  online:   "bg-[#e8fdf0] text-[#17c964]",
  offline:  "bg-[#f1f1f1] text-[#666]",
  abnormal: "bg-[#fdeaea] text-[#f31260]",
  unknown:  "bg-[#f1f1f1] text-[#999]",
};

export default function GdmsPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [devices, setDevices] = useState<GdmsDevice[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/gdms/devices");
      if (res.status === 503) {
        const d = await res.json();
        setMissing(d.missing ?? []);
        setState("unconfigured");
        return;
      }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      setDevices(data.data ?? []);
      setState("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setState("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c = {} as Record<GdmsDeviceStatus, number>;
    for (const d of devices) c[d.status] = (c[d.status] ?? 0) + 1;
    return c;
  }, [devices]);

  // Online/offline always show so the control doesn't shift around as devices
  // come and go; abnormal/unknown appear only when something is in that state,
  // which keeps every device reachable without a permanently empty pill.
  const filters = useMemo<StatusFilter[]>(() => {
    const extra = (["abnormal", "unknown"] as GdmsDeviceStatus[]).filter((s) => counts[s]);
    return ["all", "online", "offline", ...extra];
  }, [counts]);

  const visible = useMemo(
    () => (statusFilter === "all" ? devices : devices.filter((d) => d.status === statusFilter)),
    [devices, statusFilter],
  );

  // The pills follow the app's convention and carry no counts, so the headline
  // is where the online/offline split stays visible.
  const summary = `${devices.length} device${devices.length === 1 ? "" : "s"} · ${counts.online ?? 0} online · ${counts.offline ?? 0} offline`;

  return (
    <div>
      <Header
        title="GDMS"
        subtitle={
          state === "ok"
            ? summary
            : "Grandstream device management across organizations and sites"
        }
        actions={
          <button
            onClick={load}
            disabled={state === "loading"}
            className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[13px] font-medium text-[#0a0a0a] px-3 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${state === "loading" ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {/* Filters */}
      {state === "ok" && devices.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors capitalize ${
                  statusFilter === f
                    ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                    : "bg-white text-[#666] border-[#eaeaea] hover:border-[#ccc]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-[#eaeaea] rounded-xl">
        {state === "loading" && (
          <div className="py-20 text-center">
            <RefreshCw className="w-4 h-4 animate-spin text-[#ccc] mx-auto mb-3" />
            <p className="text-sm text-[#999]">Loading devices…</p>
          </div>
        )}

        {state === "unconfigured" && (
          <div className="py-20 text-center">
            <AlertCircle className="w-5 h-5 text-[#f59e0b] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">GDMS credentials incomplete</p>
            <p className="text-xs text-[#999] max-w-md mx-auto">
              Add{" "}
              {missing.map((k, i) => (
                <span key={k}>
                  {i > 0 && ", "}
                  <code className="bg-[#f1f1f1] px-1 rounded">{k}</code>
                </span>
              ))}{" "}
              to <code className="bg-[#f1f1f1] px-1 rounded">.env.local</code> and restart. The
              GDMS token endpoint is an OAuth2 password grant, so the account login is required
              in addition to the API ID and secret key.
            </p>
          </div>
        )}

        {state === "error" && (
          <div className="py-20 text-center">
            <AlertCircle className="w-5 h-5 text-[#dc2626] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">Failed to load devices</p>
            <p className="text-xs text-[#999] mb-4 max-w-lg mx-auto">{error}</p>
            <button onClick={load} className="text-xs text-[#0070f3] hover:underline font-medium">
              Retry
            </button>
          </div>
        )}

        {state === "ok" && devices.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">No devices found</p>
            <p className="text-xs text-[#999]">No Grandstream devices are enrolled in this GDMS account.</p>
          </div>
        )}

        {state === "ok" && devices.length > 0 && visible.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">No {statusFilter} devices</p>
            <p className="text-xs text-[#999]">
              None of the {devices.length} enrolled devices are {statusFilter}.
            </p>
          </div>
        )}

        {state === "ok" && visible.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#eaeaea]">
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Device</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Model</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">MAC</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Site</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Firmware</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => (
                  <tr key={d.mac} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#e8f2ff] flex items-center justify-center shrink-0">
                          <Laptop className="w-3.5 h-3.5 text-[#0070f3]" />
                        </div>
                        <span className="text-sm font-medium text-[#0a0a0a]">{d.name || "-"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-[#666]">{d.model || "-"}</td>
                    <td className="px-5 py-3 text-sm text-[#666] font-mono">{d.mac || "-"}</td>
                    <td className="px-5 py-3 text-sm text-[#666]">{d.siteName || "-"}</td>
                    <td className="px-5 py-3 text-sm text-[#666] font-mono">{d.firmwareVersion || "-"}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[d.status]}`}>
                        {d.status}
                      </span>
                    </td>
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
