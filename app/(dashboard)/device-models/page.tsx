"use client";

import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import Select from "@/components/ui/Select";
import { Cpu, Tag, RefreshCw, AlertCircle } from "lucide-react";

interface DeviceModel {
  brand?: string;
  model?: string;
  ndp_syntax?: string;
  [key: string]: unknown;
}

type ViewState = "loading" | "unconfigured" | "error" | "ok";

export default function DeviceModelsPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [models, setModels] = useState<DeviceModel[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");

  async function load(silent = false) {
    if (!silent) setState("loading");
    try {
      const res = await fetch("/api/ringlogix/device-models");
      if (res.status === 503) { if (!silent) setState("unconfigured"); return; }
      const data = await res.json();
      if (data?.error === "not_configured") { if (!silent) setState("unconfigured"); return; }
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const arr: DeviceModel[] = Array.isArray(data) ? data : (data?.data ?? []);
      setModels(arr);
      setState("ok");
      try { localStorage.setItem("sc:device-models", JSON.stringify(arr)); } catch {}
    } catch (e) {
      if (!silent) { setError(e instanceof Error ? e.message : "Failed to load"); setState("error"); }
    }
  }

  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:device-models");
      if (c) { setModels(JSON.parse(c)); setState("ok"); load(true); }
      else load();
    } catch { load(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brands = Array.from(new Set(models.map((m) => m.brand).filter(Boolean))) as string[];

  const filtered = models.filter((m) => {
    const term = search.toLowerCase();
    const matchSearch = !term || m.model?.toLowerCase().includes(term) || m.brand?.toLowerCase().includes(term) || m.ndp_syntax?.toLowerCase().includes(term);
    const matchBrand = !brandFilter || m.brand === brandFilter;
    return matchSearch && matchBrand;
  });

  return (
    <div>
      <Header
        title="Device Models"
        subtitle="Supported provisioning devices"
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

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Cpu className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? models.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Models</p>
          <p className="text-xs text-[#999]">Supported device models</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Tag className="w-4 h-4 text-[#17c964]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? brands.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Unique Brands</p>
          <p className="text-xs text-[#999]">Manufacturers supported</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">Device Catalog</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-36">
              <Select
                value={brandFilter}
                onChange={setBrandFilter}
                options={[
                  { value: "", label: "All brands" },
                  ...brands.map((b) => ({ value: b, label: b })),
                ]}
              />
            </div>
            <input
              type="text"
              placeholder="Search models…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-56 outline-none focus:border-[#0070f3] transition-colors"
            />
          </div>
        </div>

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Loading device models…</p>
          </div>
        )}

        {state === "unconfigured" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f5a524] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">API not configured</p>
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
            <Cpu className="w-6 h-6 text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#999]">No device models found{search || brandFilter ? " for that filter" : ""}.</p>
          </div>
        )}

        {state === "ok" && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#eaeaea] bg-[#fafafa]">
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Brand</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Model</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">NDP Syntax</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr key={(m.brand ?? "") + (m.model ?? "") + i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#e8f2ff] flex items-center justify-center shrink-0">
                          <Cpu className="w-3.5 h-3.5 text-[#0070f3]" />
                        </div>
                        <span className="text-sm font-medium text-[#0a0a0a]">{m.brand || "-"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666]">{m.model || "-"}</td>
                    <td className="px-4 py-3 text-sm text-[#666] font-mono">{m.ndp_syntax || "-"}</td>
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
