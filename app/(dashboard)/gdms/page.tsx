"use client";

import { useEffect, useState, useCallback } from "react";
import Header from "@/components/layout/Header";
import { RefreshCw, AlertCircle, Wrench } from "lucide-react";
import type { GdmsDevice } from "@/lib/gdms";

type ViewState = "loading" | "unconfigured" | "not_implemented" | "error" | "ok";

export default function GdmsPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [devices, setDevices] = useState<GdmsDevice[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/gdms/devices");
      if (res.status === 503) { setState("unconfigured"); return; }
      if (res.status === 501) { setState("not_implemented"); return; }
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

  return (
    <div>
      <Header
        title="GDMS"
        subtitle="Device management across organizations and sites"
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
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">API keys not configured</p>
            <p className="text-xs text-[#999]">
              Add <code className="bg-[#f1f1f1] px-1 rounded">GDMS_API_ID</code> and{" "}
              <code className="bg-[#f1f1f1] px-1 rounded">GDMS_SECRET_KEY</code> to{" "}
              <code className="bg-[#f1f1f1] px-1 rounded">.env.local</code> and restart.
            </p>
          </div>
        )}

        {state === "not_implemented" && (
          <div className="py-20 text-center">
            <Wrench className="w-5 h-5 text-[#0070f3] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">Integration not wired up yet</p>
            <p className="text-xs text-[#999] max-w-sm mx-auto">
              API keys are configured, but the GDMS organization/site/device list endpoints
              still need to be implemented in <code className="bg-[#f1f1f1] px-1 rounded">lib/gdms.ts</code> once
              the endpoint specs (auth token exchange, request/response shapes) are available.
            </p>
          </div>
        )}

        {state === "error" && (
          <div className="py-20 text-center">
            <AlertCircle className="w-5 h-5 text-[#dc2626] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">Failed to load devices</p>
            <p className="text-xs text-[#999] mb-4">{error}</p>
            <button onClick={load} className="text-xs text-[#0070f3] hover:underline font-medium">
              Retry
            </button>
          </div>
        )}

        {state === "ok" && devices.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">No devices found</p>
          </div>
        )}

        {state === "ok" && devices.length > 0 && (
          <ul className="divide-y divide-[#f8f8f8]">
            {devices.map((d) => (
              <li key={d.id} className="px-5 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-[#0a0a0a]">{d.name}</p>
                  <p className="text-[11px] text-[#aaa] mt-0.5">{d.model}</p>
                </div>
                <span className="text-[12px] text-[#888]">{d.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
