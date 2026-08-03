"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import { Wifi, AlertTriangle, RefreshCw, AlertCircle } from "lucide-react";
import type { UiEnrichedSite, UiIssuePeriod } from "@/lib/unifi";
import IspLogo from "@/components/unifi/IspLogo";
import WanHealthBar, { expandPeriods, N_BARS } from "@/components/unifi/WanHealthBar";
import Select from "@/components/ui/Select";

type ViewState = "loading" | "unconfigured" | "error" | "ok";
type FilterTab = "all" | "healthy" | "degraded" | "disconnected";
type SortKey = "status" | "az" | "za" | "clients" | "devices" | "uptime-worst" | "uptime-best";

// ── Status helpers ────────────────────────────────────────────────────────────

function currentWanDown(issues: UiIssuePeriod[]): boolean {
  if (!issues.length) return false;
  const currentIdx = Math.floor(Date.now() / 1000 / 300);
  const map = new Map(expandPeriods(issues).map((p) => [p.index, p]));
  // Only treat explicit wanDowntime as "currently offline" — notReported can lag
  // behind recovery (data isn't pushed immediately when a site comes back online)
  for (let offset = 0; offset <= 2; offset++) {
    const p = map.get(currentIdx - offset);
    if (p?.wanDowntime === true) return true;
  }
  return false;
}

function getSiteStatus(site: UiEnrichedSite): "offline" | "degraded" | "healthy" {
  const c = site.statistics.counts;
  // connected is the primary real-time signal (gateway reports to UniFi cloud)
  // currentWanDown catches explicit WAN-down events even if connected is stale
  if (!site.connected || currentWanDown(site.internetIssues)) return "offline";
  if ((c.offlineDevice ?? 0) > 0 || (c.criticalNotification ?? 0) > 0) return "degraded";
  return "healthy";
}

const STATUS_RANK: Record<"offline" | "degraded" | "healthy", number> = { offline: 0, degraded: 1, healthy: 2 };

function sortSites(list: UiEnrichedSite[], key: SortKey): UiEnrichedSite[] {
  const s = [...list];
  switch (key) {
    case "status":
      return s.sort((a, b) => {
        const d = STATUS_RANK[getSiteStatus(a)] - STATUS_RANK[getSiteStatus(b)];
        return d !== 0 ? d : a.displayName.localeCompare(b.displayName);
      });
    case "az":   return s.sort((a, b) => a.displayName.localeCompare(b.displayName));
    case "za":   return s.sort((a, b) => b.displayName.localeCompare(a.displayName));
    case "clients":
      return s.sort((a, b) => {
        const ca = a.statistics.counts.wifiClient + a.statistics.counts.wiredClient + a.statistics.counts.guestClient;
        const cb = b.statistics.counts.wifiClient + b.statistics.counts.wiredClient + b.statistics.counts.guestClient;
        return cb - ca;
      });
    case "devices":
      return s.sort((a, b) => b.statistics.counts.totalDevice - a.statistics.counts.totalDevice);
    case "uptime-worst":
      return s.sort((a, b) => (a.wanUptime ?? 100) - (b.wanUptime ?? 100));
    case "uptime-best":
      return s.sort((a, b) => (b.wanUptime ?? 0) - (a.wanUptime ?? 0));
  }
}

// Walk backwards from current period to find when the outage started
function getOfflineSince(issues: UiIssuePeriod[]): Date | null {
  if (!issues.length) return null;
  const currentIdx = Math.floor(Date.now() / 1000 / 300);
  const map = new Map(expandPeriods(issues).map((p) => [p.index, p]));
  let startIdx: number | null = null;
  for (let i = currentIdx; i >= currentIdx - N_BARS; i--) {
    const p = map.get(i);
    if (p?.wanDowntime || p?.notReported) {
      startIdx = i;
    } else {
      break;
    }
  }
  return startIdx !== null ? new Date(startIdx * 5 * 60 * 1000) : null;
}

function formatDuration(since: Date): string {
  const mins = Math.floor((Date.now() - since.getTime()) / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24)    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

const GW_NAMES: Record<string, string> = {
  UCGMAX: "UCG Max", UCGULTRA: "UCG Ultra",
  UDMA67A: "UDM", UDMPRO: "UDM Pro", UDMPROSE: "UDM SE",
  UDMPROMAX: "UDM Pro Max", UDR: "UDR", UDR7: "UDR7",
  UDRULT: "UDR Ultra", UDW: "UDW", UX: "UX",
  UGWXG: "USG XG", UGWHD4: "USG",
};
function gwLabel(s: string) {
  return GW_NAMES[s?.toUpperCase()] ?? s ?? "Unknown";
}

function SiteCard({ site }: { site: UiEnrichedSite }) {
  const c = site.statistics.counts;
  const onlineDevices = c.totalDevice - c.offlineDevice;
  const totalClients  = c.wifiClient + c.wiredClient + c.guestClient;
  const hasAlert      = c.criticalNotification > 0;

  const status      = getSiteStatus(site);
  const isOffline   = status === "offline";
  const isDegraded  = status === "degraded";

  const offlineSince   = isOffline ? getOfflineSince(site.internetIssues) : null;
  const offlineDuration = offlineSince ? formatDuration(offlineSince) : null;

  // Grey for offline (WAN down / gateway disconnected), yellow degraded, green healthy
  const statusDot   = isOffline ? "bg-[#9ca3af]"  : isDegraded ? "bg-[#f59e0b]" : "bg-[#22c55e]";
  const statusText  = isOffline ? "text-[#6b7280]" : isDegraded ? "text-[#b45309]" : "text-[#16a34a]";
  const statusLabel = isOffline ? "Offline" : isDegraded ? (hasAlert ? "Alert" : "Degraded") : "Online";
  const cardBorder  = isOffline ? "border-[#e5e7eb] hover:border-[#d1d5db]"
                    : isDegraded ? "border-[#fde68a] hover:border-[#fbbf24]"
                    : "border-[#eaeaea] hover:border-[#c9c9c9]";

  return (
    <Link
      href={`/sites/${site.siteId}`}
      className={`group block bg-white rounded-xl border p-4 transition-all duration-150 hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)] ${cardBorder}`}
    >
      {/* Name + status */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-[13px] font-semibold text-[#111] leading-snug group-hover:text-[#0070f3] transition-colors line-clamp-2">
          {site.displayName}
        </p>
        <span className={`shrink-0 flex items-center gap-1 text-[11px] font-medium mt-0.5 ${statusText}`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
          {statusLabel}
          {isOffline && offlineDuration && (
            <span className="text-[10px] font-normal opacity-75">· {offlineDuration}</span>
          )}
        </span>
      </div>

      {/* Gateway model */}
      <p className="text-[11px] text-[#999] mb-3">{gwLabel(site.hardware.shortname)}</p>

      {/* Uptime bar + timestamps */}
      <WanHealthBar issues={site.internetIssues} isOffline={isOffline} />

      {/* ISP row */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#f5f5f5]">
        {site.ispName ? (
          <div className="flex items-center gap-2 min-w-0">
            <IspLogo ispName={site.ispName} size={16} className="shrink-0" />
            <span className="text-[11px] text-[#555] font-medium truncate">{site.ispName}</span>
          </div>
        ) : (
          <span className="text-[11px] text-[#bbb]">No ISP</span>
        )}
        {hasAlert && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-[#f59e0b] shrink-0">
            <AlertTriangle className="w-3 h-3" />
            {c.criticalNotification} alert{c.criticalNotification !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Devices row */}
      <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-[#f5f5f5]">
        <div className="flex items-center gap-2 text-[11px]">
          <span className={`font-semibold tabular-nums ${c.offlineDevice > 0 ? "text-[#dc2626]" : "text-[#111]"}`}>
            {onlineDevices}/{c.totalDevice}
          </span>
          <span className="text-[#bbb]">devices</span>
          {c.offlineDevice > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] px-1.5 py-0.5 rounded-full">
              {c.offlineDevice} offline
            </span>
          )}
        </div>
        <span className="text-[11px] text-[#bbb]">{totalClients} clients</span>
      </div>
    </Link>
  );
}

export default function SitesPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [sites, setSites] = useState<UiEnrichedSite[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("status");

  const load = useCallback(async (silent = false) => {
    if (!silent) setState("loading");
    try {
      const res = await fetch("/api/unifi/sites");
      if (res.status === 503) { if (!silent) setState("unconfigured"); return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      setSites(data.data ?? []);
      setState("ok");
      setLastUpdated(new Date());
      try { localStorage.setItem("sc:sites", JSON.stringify(data.data ?? [])); } catch {}
    } catch (e) {
      if (!silent) { setError(e instanceof Error ? e.message : "Failed to load"); setState("error"); }
    }
  }, []);

  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:sites");
      if (c) { setSites(JSON.parse(c)); setState("ok"); }
    } catch {}
    load(true);
    const interval = setInterval(() => load(true), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const totalDevicesOffline = sites.reduce((n, s) => n + s.statistics.counts.offlineDevice, 0);
  const disconnectedCount   = sites.filter((s) => getSiteStatus(s) === "offline").length;
  const healthyCount        = sites.filter((s) => getSiteStatus(s) === "healthy").length;
  const degradedCount       = sites.filter((s) => getSiteStatus(s) === "degraded").length;

  const filtered = sortSites(
    sites.filter((s) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        s.displayName.toLowerCase().includes(q) ||
        s.ispName.toLowerCase().includes(q) ||
        s.hardware.shortname.toLowerCase().includes(q) ||
        s.wanIp.includes(q) ||
        s.location.toLowerCase().includes(q);
      const st = getSiteStatus(s);
      const matchesTab =
        tab === "all" ||
        (tab === "healthy"      && st === "healthy") ||
        (tab === "degraded"     && st === "degraded") ||
        (tab === "disconnected" && st === "offline");
      return matchesSearch && matchesTab;
    }),
    sortBy,
  );

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "all",          label: "All",       count: sites.length },
    { id: "healthy",      label: "Online",    count: healthyCount },
    { id: "degraded",     label: "Alerts",    count: degradedCount },
    { id: "disconnected", label: "Offline",   count: disconnectedCount },
  ];

  const stats = [
    { label: "Total Sites",       value: sites.length,          accent: undefined },
    { label: "Online",            value: healthyCount,          accent: healthyCount > 0 && degradedCount === 0 && disconnectedCount === 0 ? "text-[#16a34a]" : undefined },
    { label: "Alerts",            value: degradedCount,         accent: degradedCount > 0 ? "text-[#b45309]" : undefined },
    { label: "Offline",           value: disconnectedCount,     accent: disconnectedCount > 0 ? "text-[#dc2626]" : undefined },
    { label: "Devices Offline",   value: totalDevicesOffline,   accent: totalDevicesOffline > 0 ? "text-[#dc2626]" : undefined },
  ];

  return (
    <div>
      <Header
        title="Sites"
        subtitle="UniFi Site Manager"
        actions={
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-[#aaa]">
                Updated {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
              </span>
            )}
            <button
              onClick={() => load(false)}
              disabled={state === "loading"}
              className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-xs font-medium text-[#444] px-3 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${state === "loading" ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:items-stretch md:divide-x divide-[#f0f0f0] bg-white border border-[#eaeaea] rounded-xl mb-5 overflow-hidden">
        {stats.map(({ label, value, accent }, i) => (
          <div key={label} className={`px-4 py-3 md:flex-1 md:px-5 md:py-4 border-b sm:border-b md:border-b-0 border-[#f0f0f0]`}>
            <p className={`text-xl md:text-[22px] font-bold leading-none tabular-nums ${accent ?? "text-[#111]"} ${state !== "ok" ? "opacity-30" : ""}`}>
              {state === "ok" ? value : "-"}
            </p>
            <p className="text-[11px] text-[#999] mt-1 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar: tabs + search */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <div className="flex items-center gap-0.5 bg-[#f5f5f5] rounded-lg p-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === t.id
                  ? "bg-white text-[#111] shadow-sm"
                  : "text-[#888] hover:text-[#333]"
              }`}
            >
              {t.label}
              {state === "ok" && (
                <span className={`ml-1.5 text-[10px] tabular-nums ${tab === t.id ? "text-[#999]" : "text-[#bbb]"}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Sort dropdown */}
          <div className="w-40 shrink-0">
            <Select
              value={sortBy}
              onChange={(v) => setSortBy(v as SortKey)}
              options={[
                { value: "status", label: "By Status" },
                { value: "az", label: "A to Z" },
                { value: "za", label: "Z to A" },
                { value: "clients", label: "Most Clients" },
                { value: "devices", label: "Most Devices" },
                { value: "uptime-worst", label: "Worst Uptime" },
                { value: "uptime-best", label: "Best Uptime" },
              ]}
            />
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search sites..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-48 outline-none focus:border-[#999] bg-white transition-colors placeholder:text-[#bbb]"
          />
        </div>
      </div>

      {/* Loading */}
      {state === "loading" && (
        <div className="py-20 text-center">
          <RefreshCw className="w-4 h-4 animate-spin text-[#ccc] mx-auto mb-3" />
          <p className="text-xs text-[#aaa]">Loading sites…</p>
        </div>
      )}

      {/* Unconfigured */}
      {state === "unconfigured" && (
        <div className="py-16 text-center bg-white border border-[#eaeaea] rounded-xl">
          <Wifi className="w-5 h-5 text-[#ccc] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#111] mb-1">API key not configured</p>
          <p className="text-xs text-[#999]">
            Add <code className="bg-[#f5f5f5] px-1 rounded">UNIFI_API_KEY</code> to{" "}
            <code className="bg-[#f5f5f5] px-1 rounded">.env.local</code> and restart.
          </p>
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="py-16 text-center bg-white border border-[#eaeaea] rounded-xl">
          <AlertCircle className="w-5 h-5 text-[#ef4444] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#111] mb-1">Failed to load</p>
          <p className="text-xs text-[#999] mb-4">{error}</p>
          <button onClick={() => load(false)} className="text-xs text-[#0070f3] hover:underline font-medium">
            Try again
          </button>
        </div>
      )}

      {/* Card grid */}
      {state === "ok" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start">
          {filtered.map((site, i) => (
            <SiteCard key={`${site.siteId}-${i}`} site={site} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full py-16 text-center">
              <p className="text-xs text-[#999]">No sites match your filter.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
