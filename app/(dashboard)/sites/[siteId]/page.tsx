"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  Wifi,
  Server,
  AlertCircle,
  Monitor,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import IspLogo from "@/components/unifi/IspLogo";
import SiteTopology from "@/components/unifi/SiteTopology";
import RealTopology from "@/components/unifi/RealTopology";
import WanHealthBar from "@/components/unifi/WanHealthBar";
import ZoomPan from "@/components/unifi/ZoomPan";
import type { UiEnrichedSite, UiDevice, UiRealTopology } from "@/lib/unifi";

const SiteLatencyChart = dynamic(
  () => import("@/components/unifi/SiteLatencyChart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-52 flex items-center justify-center">
        <RefreshCw className="w-4 h-4 animate-spin text-[#ccc]" />
      </div>
    ),
  }
);

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return "-";
  const w = Math.floor(seconds / 604800);
  const d = Math.floor((seconds % 604800) / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (w > 0) return `${w}w ${d}d ${h}h`;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatUptimeSince(iso?: string): string {
  if (!iso) return "-";
  const start = new Date(iso).getTime();
  if (isNaN(start)) return "-";
  return formatUptime(Math.floor((Date.now() - start) / 1000));
}

function formatDate(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function DeviceDetail({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] text-[#aaa] uppercase tracking-wide font-medium mb-0.5">{label}</p>
      <p className="text-[11px] text-[#333] font-medium">{value ?? "-"}</p>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[86px_1fr] items-start gap-3 py-2.5 border-b border-[#f4f4f4] last:border-0">
      <span className="text-[11px] text-[#9a9a9a] font-medium pt-px">{label}</span>
      <div className="text-[11px] text-[#222] font-medium text-right leading-relaxed min-w-0 justify-self-end">
        {children}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-block text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-3.5 pb-1.5 border-b-2 border-[#0d9488]">
      {children}
    </p>
  );
}

const CARD = "bg-white rounded-2xl border border-[#ededed] shadow-[0_1px_2px_rgba(0,0,0,0.03)]";

// Module-level (not React state), so it survives this component unmounting —
// navigating away and back to the same site re-shows the last-known data
// instantly instead of a blank full-page "Loading site…" spinner. A silent
// background refresh still runs on remount to catch anything that changed.
interface SiteDetailCacheEntry {
  site: UiEnrichedSite | null;
  devices: UiDevice[];
  topology: UiRealTopology | null;
  lastUpdated: Date;
}
const siteDetailCache = new Map<string, SiteDetailCacheEntry>();

export default function SiteDetailPage() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const cached = siteDetailCache.get(siteId);

  const [site, setSite] = useState<UiEnrichedSite | null>(cached?.site ?? null);
  const [devices, setDevices] = useState<UiDevice[]>(cached?.devices ?? []);
  const [topology, setTopology] = useState<UiRealTopology | null>(cached?.topology ?? null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.lastUpdated ?? null);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "topology">("overview");
  const [showLatency, setShowLatency] = useState(true);
  const [showPacketLoss, setShowPacketLoss] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [sitesRes, devicesRes, topologyRes] = await Promise.allSettled([
        fetch("/api/unifi/sites"),
        fetch(`/api/unifi/devices?siteId=${siteId}`),
        fetch(`/api/unifi/topology?siteId=${siteId}`),
      ]);

      const prev = siteDetailCache.get(siteId);
      let nextSite = prev?.site ?? null;
      let nextDevices = prev?.devices ?? [];
      let nextTopology = prev?.topology ?? null;

      if (sitesRes.status === "fulfilled" && sitesRes.value.ok) {
        const { data } = await sitesRes.value.json();
        nextSite = (data as UiEnrichedSite[]).find((s) => s.siteId === siteId) ?? null;
        setSite(nextSite);
      }

      if (devicesRes.status === "fulfilled" && devicesRes.value.ok) {
        const { data } = await devicesRes.value.json();
        nextDevices = data ?? [];
        setDevices(nextDevices);
      }

      if (topologyRes.status === "fulfilled" && topologyRes.value.ok) {
        nextTopology = await topologyRes.value.json();
        setTopology(nextTopology);
      }
      const now = new Date();
      setLastUpdated(now);
      siteDetailCache.set(siteId, { site: nextSite, devices: nextDevices, topology: nextTopology, lastUpdated: now });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    load(siteDetailCache.has(siteId)); // already-cached site: refresh quietly instead of blanking the page
    const interval = setInterval(() => load(true), 30_000);
    return () => clearInterval(interval);
  }, [siteId, load]);

  if (loading) {
    return (
      <div className="-mx-8 -mt-8 -mb-8 min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-4 h-4 animate-spin text-[#ccc] mx-auto mb-3" />
          <p className="text-sm text-[#999]">Loading site…</p>
        </div>
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="-mx-4 -mt-6 -mb-6 md:-mx-8 md:-mt-8 md:-mb-8 min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-4 h-4 text-[#ef4444] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#111] mb-2">{error || "Site not found"}</p>
          <Link href="/sites" className="text-xs text-[#0070f3] hover:underline">
            Back to Sites
          </Link>
        </div>
      </div>
    );
  }

  const c = site.statistics.counts;
  const online = c.totalDevice - c.offlineDevice;
  const wanUptime = site.statistics.percentages?.wanUptime;
  const gatewayDevice = devices.find(
    (d) => d.mac && site.mac && d.mac.toLowerCase().replace(/:/g, "") === site.mac.toLowerCase().replace(/:/g, "")
  );
  const systemUptime = gatewayDevice?.uptime
    ? formatUptime(gatewayDevice.uptime)
    : formatUptimeSince(gatewayDevice?.startupTime);

  const sidebarStats = [
    { label: "Online",  value: online,         color: online > 0 ? "text-[#16a34a]" : "text-[#111]" },
    { label: "Offline", value: c.offlineDevice, color: c.offlineDevice > 0 ? "text-[#dc2626]" : "text-[#111]" },
    { label: "WiFi",    value: c.wifiClient,    color: "text-[#111]" },
    { label: "Wired",   value: c.wiredClient,   color: "text-[#111]" },
  ];

  return (
    <div className="-mx-4 -mt-6 -mb-6 md:-mx-8 md:-mt-8 md:-mb-8 min-h-screen bg-white flex flex-col">

      {/* Top bar */}
      <div className="bg-white border-b border-[#eeeeee] px-4 md:px-6 py-3.5 md:h-14 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/sites"
            className="flex items-center gap-1.5 text-xs text-[#888] hover:text-[#111] transition-colors shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Sites
          </Link>
          <span className="text-[#ddd]">/</span>
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-semibold text-[#111] truncate">{site.displayName}</p>
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0 ${
                site.connected ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#f3f4f6] text-[#6b7280]"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${site.connected ? "bg-[#22c55e]" : "bg-[#9ca3af]"}`} />
              {site.connected ? "Online" : "Offline"}
            </span>
            {c.criticalNotification > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium text-[#d97706] bg-[#fffbeb] px-2.5 py-1 rounded-full shrink-0">
                <AlertTriangle className="w-3 h-3" />
                {c.criticalNotification} alert{c.criticalNotification > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {lastUpdated && (
            <span className="hidden md:flex text-[11px] text-[#bbb] items-center gap-1.5 mr-1">
              {refreshing && <RefreshCw className="w-3 h-3 animate-spin" />}
              {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
            </span>
          )}
          <a
            href={`https://unifi.ui.com/consoles/${site.hostId}/network/default/dashboard`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-[#555] hover:text-[#111] border border-[#eeeeee] bg-white hover:bg-[#fafafa] px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            <ExternalLink className="w-3 h-3" />
            <span className="hidden sm:inline">Open in UniFi</span>
            <span className="sm:hidden">UniFi</span>
          </a>
          <button
            onClick={() => load(false)}
            className="flex items-center gap-1.5 text-xs text-white border border-[#0d9488] px-3 py-1.5 rounded-lg bg-[#0d9488] hover:bg-[#0b7d73] transition-colors font-medium"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Body — stacks on mobile */}
      <div className="flex flex-col md:flex-row flex-1 overflow-auto md:overflow-hidden">

        {/* Sidebar — one continuous panel (not separate floating cards), divided
            by hairlines like a real settings page instead of grey gutters */}
        <aside className="w-full md:w-72 shrink-0 md:overflow-y-auto border-b md:border-b-0 md:border-r border-[#eee] bg-white">

          {/* Stats 2x2 */}
          <div className="grid grid-cols-2 border-b border-[#eee]">
            {sidebarStats.map(({ label, value, color }, i) => (
              <div
                key={label}
                className={`px-5 py-4 ${i % 2 === 0 ? "border-r border-[#eee]" : ""} ${i < 2 ? "border-b border-[#eee]" : ""}`}
              >
                <p className={`text-[26px] font-bold tabular-nums leading-none ${color}`}>{value}</p>
                <p className="text-[10px] text-[#a3a3a3] mt-2 font-medium uppercase tracking-wide">{label}</p>
              </div>
            ))}
          </div>

          {/* Details */}
          <div className="p-5 border-b border-[#eee]">
            <SectionLabel>Details</SectionLabel>

            {/* Info rows */}
            <div>
              <InfoRow label="Gateway">
                <span className="break-words">{site.hardware.name || "-"}</span>
              </InfoRow>
              <InfoRow label="Model">
                {site.hardware.shortname || "-"}
              </InfoRow>
              {site.lanIp && (
                <InfoRow label="Gateway IP">
                  <span className="font-mono text-[10px]">{site.lanIp}</span>
                </InfoRow>
              )}
              {systemUptime !== "-" && (
                <InfoRow label="Uptime">
                  {systemUptime}
                </InfoRow>
              )}
              {site.location && (
                <InfoRow label="Location">
                  <span className="break-words">{site.location}</span>
                </InfoRow>
              )}
              {site.firmwareVersion && (
                <InfoRow label="Firmware">
                  <span className="font-mono text-[10px]">{site.firmwareVersion}</span>
                </InfoRow>
              )}
              {site.osVersion && (
                <InfoRow label="OS Version">
                  <span className="font-mono text-[10px]">{site.osVersion}</span>
                </InfoRow>
              )}
              {site.serialNumber && (
                <InfoRow label="Serial">
                  <span className="font-mono text-[10px] break-all">{site.serialNumber.toUpperCase()}</span>
                </InfoRow>
              )}
              {site.mac && (
                <InfoRow label="MAC">
                  <span className="font-mono text-[10px]">{site.mac.toUpperCase()}</span>
                </InfoRow>
              )}
              {site.timezone && (
                <InfoRow label="Timezone">
                  {site.timezone}
                </InfoRow>
              )}
            </div>
          </div>

          {/* Internet */}
          <div className="p-5">
            <SectionLabel>
              Internet{site.wans.length > 1 ? ` · ${site.wans.length} WANs` : ""}
            </SectionLabel>
            <div className="space-y-2">
              {site.wans.length > 0 ? (
                site.wans.map((w) => {
                  const inactive = !w.ipv4 && (w.wanUptime ?? 0) === 0;
                  const uptimeTone =
                    w.wanUptime == null ? "text-[#bbb] bg-[#f5f5f5]" :
                    w.wanUptime >= 99   ? "text-[#16a34a] bg-[#f0fdf4]" :
                    w.wanUptime >= 90   ? "text-[#d97706] bg-[#fffbeb]" :
                                          "text-[#dc2626] bg-[#fef2f2]";
                  return (
                    <div key={w.key} className={`rounded-xl border px-3.5 py-3 ${inactive ? "border-[#f2f2f2] bg-[#fafafa]" : "border-[#f0f0f0]"}`}>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[9px] font-semibold text-[#999] uppercase tracking-wider">
                          {w.label}
                        </span>
                        {!inactive && w.wanUptime !== null && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${uptimeTone}`}>
                            {w.wanUptime.toFixed(2)}%
                          </span>
                        )}
                      </div>
                      {inactive ? (
                        <span className="text-[11px] text-[#bbb]">Not connected</span>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            {w.ispName ? (
                              <span className="flex items-center gap-1.5 text-[11px] text-[#222] font-semibold">
                                <IspLogo ispName={w.ispName} size={14} />
                                {w.ispName}
                              </span>
                            ) : <span className="text-[11px] text-[#333]">-</span>}
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-1">
                            {w.ispOrganization && w.ispOrganization !== w.ispName ? (
                              <p className="text-[9.5px] text-[#bbb] truncate">{w.ispOrganization}</p>
                            ) : <span />}
                            <span className="font-mono text-[10px] text-[#888] shrink-0">{w.ipv4 || "-"}</span>
                          </div>
                          {w.ipType !== "unknown" && (
                            <div className="flex justify-end mt-1">
                              <span
                                title={
                                  w.ipTypeHostname
                                    ? `Estimated from reverse DNS: ${w.ipTypeHostname}`
                                    : "Estimated from reverse DNS"
                                }
                                className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                                  w.ipType === "static"
                                    ? "text-[#0369a1] bg-[#f0f9ff]"
                                    : "text-[#7c3aed] bg-[#f5f3ff]"
                                }`}
                              >
                                {w.ipType === "static" ? "Static IP" : "Dynamic IP"}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })
              ) : (
                <>
                  <InfoRow label="WAN IP">
                    <span className="font-mono text-[10px]">{site.wanIp || "-"}</span>
                  </InfoRow>
                  <InfoRow label="ISP">
                    {site.ispName ? (
                      <div className="flex items-center gap-1.5 justify-end">
                        <IspLogo ispName={site.ispName} size={14} />
                        <span>{site.ispName}</span>
                      </div>
                    ) : "-"}
                  </InfoRow>
                  {wanUptime !== undefined && (
                    <InfoRow label="WAN Uptime">
                      {`${wanUptime.toFixed(2)}%`}
                    </InfoRow>
                  )}
                </>
              )}
            </div>

            {/* Notices */}
            {(c.pendingUpdateDevice > 0 || c.criticalNotification > 0) && (
              <div className="mt-4 space-y-2">
                {c.pendingUpdateDevice > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#f0f9ff] border border-[#bae6fd] rounded-lg">
                    <Monitor className="w-3 h-3 text-[#0284c7] shrink-0" />
                    <p className="text-[11px] text-[#0284c7] font-medium">
                      {c.pendingUpdateDevice} update{c.pendingUpdateDevice > 1 ? "s" : ""} pending
                    </p>
                  </div>
                )}
                {c.criticalNotification > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#fffbeb] border border-[#fde68a] rounded-lg">
                    <AlertTriangle className="w-3 h-3 text-[#d97706] shrink-0" />
                    <p className="text-[11px] text-[#d97706] font-medium">
                      {c.criticalNotification} critical alert{c.criticalNotification > 1 ? "s" : ""}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto flex flex-col">

          {/* Tabs */}
          <div className="flex items-center gap-1 px-6 pt-3.5 border-b border-[#eeeeee] bg-white shrink-0">
            {([
              { key: "overview", label: "Overview" },
              { key: "topology", label: "Topology" },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 pb-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-[#0d9488] text-[#0d9488]"
                    : "border-transparent text-[#999] hover:text-[#111]"
                }`}
              >
                {tab.label}
                {tab.key === "topology" && topology?.available && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                )}
              </button>
            ))}
          </div>

          {activeTab === "overview" && (
            <div>
              {/* Internet activity */}
              <div className="border-b border-[#eee]">
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#f4f4f4]">
                  <div>
                    <h2 className="text-sm font-semibold text-[#111]">Internet activity</h2>
                    <p className="text-[11px] text-[#aaa] mt-0.5">Last 6 hours · 5 min intervals</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowLatency((v) => !v)}
                      className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-full border transition-colors ${
                        showLatency
                          ? "border-[#bae6fd] bg-[#f0fbff] text-[#0891b2]"
                          : "border-[#eee] bg-white text-[#bbb]"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${showLatency ? "bg-[#06b6d4]" : "bg-[#ddd]"}`} />
                      Avg. latency
                    </button>
                    <button
                      onClick={() => setShowPacketLoss((v) => !v)}
                      className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-full border transition-colors ${
                        showPacketLoss
                          ? "border-[#fde68a] bg-[#fffbeb] text-[#b45309]"
                          : "border-[#eee] bg-white text-[#bbb]"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${showPacketLoss ? "bg-[#f59e0b]" : "bg-[#ddd]"}`} />
                      Packet loss
                    </button>
                  </div>
                </div>
                <div className="px-4 pt-4">
                  <SiteLatencyChart issues={site.internetIssues} showLatency={showLatency} showPacketLoss={showPacketLoss} />
                </div>
                <div className="px-6 pb-5 pt-1">
                  <WanHealthBar issues={site.internetIssues} isOffline={!site.connected} />
                </div>
              </div>

              {/* Devices */}
              <div className="border-b border-[#eee]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#f4f4f4]">
                  <h2 className="text-sm font-semibold text-[#111]">Devices</h2>
                  <span className="text-[11px] text-[#aaa]">
                    <span className={c.offlineDevice > 0 ? "text-[#dc2626] font-semibold" : "text-[#111] font-semibold"}>
                      {online}
                    </span>
                    <span className="text-[#bbb]">/{c.totalDevice} online</span>
                  </span>
                </div>

                {devices.length === 0 ? (
                  <div className="py-10 text-center">
                    <Server className="w-4 h-4 text-[#ddd] mx-auto mb-2" />
                    <p className="text-xs text-[#aaa]">No device data</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="min-w-160">
                      <div className="grid grid-cols-[20px_1fr_140px_110px_120px_130px_80px] px-6 py-3 border-b border-[#f5f5f5] bg-[#fafafa]">
                        {["", "Name", "Model", "IP Address", "MAC Address", "Version", "Status"].map((h, i) => (
                          <span key={i} className="text-[10px] font-semibold text-[#aaa] uppercase tracking-wider">
                            {h}
                          </span>
                        ))}
                      </div>
                      <div className="divide-y divide-[#f7f7f7]">
                        {devices.map((d, i) => {
                          const isOnline  = d.status === "connected" || d.status === "online";
                          const isOffline = d.status === "offline"   || d.status === "disconnected";
                          const rowKey = `${d.id}-${i}`;
                          const expanded = expandedDevice === rowKey;
                          return (
                            <div key={rowKey}>
                              <div
                                onClick={() => setExpandedDevice(expanded ? null : rowKey)}
                                className="grid grid-cols-[20px_1fr_140px_110px_120px_130px_80px] px-6 py-3.5 hover:bg-[#fafafa] transition-colors cursor-pointer"
                              >
                                <span className="self-center text-[#ccc]">
                                  {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-[12px] text-[#111] font-medium truncate">{d.name || "-"}</p>
                                  {d.type && (
                                    <p className="text-[10px] text-[#bbb] mt-0.5 capitalize">{d.type}</p>
                                  )}
                                </div>
                                <span className="text-[11px] text-[#666] self-center truncate">{d.model || "-"}</span>
                                <span className="text-[11px] text-[#666] font-mono self-center">{d.ip || "-"}</span>
                                <span className="text-[10px] text-[#999] font-mono self-center truncate">{d.mac ? d.mac.toUpperCase() : "-"}</span>
                                <span className="text-[10px] text-[#999] font-mono self-center truncate">{d.version || "-"}</span>
                                <div className="self-center">
                                  <span
                                    className={`inline-flex items-center gap-1 text-[10px] font-medium ${
                                      isOnline  ? "text-[#16a34a]" :
                                      isOffline ? "text-[#dc2626]" : "text-[#999]"
                                    }`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      isOnline  ? "bg-[#22c55e]" :
                                      isOffline ? "bg-[#ef4444]" : "bg-[#d1d5db]"
                                    }`} />
                                    {d.status ? d.status.charAt(0).toUpperCase() + d.status.slice(1) : "Unknown"}
                                  </span>
                                </div>
                              </div>
                              {expanded && (
                                <div className="px-6 py-4 bg-[#fafafa] border-t border-[#f2f2f2] grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                                  <DeviceDetail label="Product Line" value={d.productLine} />
                                  <DeviceDetail label="Uptime" value={formatUptime(d.uptime)} />
                                  <DeviceDetail label="Adopted" value={formatDate(d.adoptionTime)} />
                                  <DeviceDetail label="Managed" value={d.isManaged === undefined ? "-" : d.isManaged ? "Yes" : "No"} />
                                  <DeviceDetail label="Firmware Status" value={d.firmwareStatus} />
                                  <DeviceDetail
                                    label="Update Available"
                                    value={d.updateAvailable ? <span className="text-[#d97706]">{d.updateAvailable}</span> : "Up to date"}
                                  />
                                  <DeviceDetail label="Console" value={d.isConsole === undefined ? "-" : d.isConsole ? "Yes" : "No"} />
                                  <DeviceDetail label="Device ID" value={<span className="font-mono text-[10px] break-all">{d.id}</span>} />
                                  {d.note && (
                                    <div className="col-span-2 sm:col-span-4">
                                      <DeviceDetail label="Note" value={d.note} />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Clients summary */}
              <div className="px-6 py-5">
                <h2 className="text-sm font-semibold text-[#111] mb-4">Clients</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { icon: <Wifi className="w-4 h-4" />, label: "WiFi", value: c.wifiClient },
                    { icon: <Server className="w-4 h-4" />, label: "Wired", value: c.wiredClient },
                    { icon: <AlertCircle className="w-4 h-4" />, label: "Guest", value: c.guestClient },
                  ].map(({ icon, label, value }) => (
                    <div key={label} className="flex items-center gap-3 bg-[#fafafa] border border-[#f2f2f2] rounded-xl px-4 py-3.5">
                      <div className="w-9 h-9 rounded-lg bg-white border border-[#eee] flex items-center justify-center text-[#999] shrink-0">
                        {icon}
                      </div>
                      <div>
                        <p className="text-lg font-bold text-[#111] tabular-nums leading-none">{value}</p>
                        <p className="text-[10px] text-[#aaa] mt-1.5 font-medium">{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "topology" && (
            <div className="p-6 flex-1 flex flex-col">
              <div className={`${CARD} flex-1 flex flex-col`}>
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#f4f4f4] shrink-0">
                  <h2 className="text-sm font-semibold text-[#111]">Topology</h2>
                  {topology?.available && (
                    <span className="text-[10px] text-[#16a34a] font-medium">Live client data</span>
                  )}
                </div>
                <div className="flex-1">
                  <ZoomPan>
                    {topology?.available ? (
                      <RealTopology
                        devices={topology.devices}
                        clients={topology.clients}
                        gatewayMac={site.mac}
                        ispName={site.ispName}
                        wanCount={site.wans.length}
                      />
                    ) : (
                      <SiteTopology devices={devices} />
                    )}
                  </ZoomPan>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
