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
} from "lucide-react";
import IspLogo from "@/components/unifi/IspLogo";
import type { UiEnrichedSite, UiDevice } from "@/lib/unifi";

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

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-[#f2f2f2] last:border-0">
      <span className="text-[11px] text-[#aaa] font-medium shrink-0 w-20 pt-px">{label}</span>
      <div className="text-[11px] text-[#333] font-medium text-right leading-relaxed min-w-0">
        {children}
      </div>
    </div>
  );
}

export default function SiteDetailPage() {
  const params = useParams();
  const siteId = params?.siteId as string;

  const [site, setSite] = useState<UiEnrichedSite | null>(null);
  const [devices, setDevices] = useState<UiDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [sitesRes, devicesRes] = await Promise.allSettled([
        fetch("/api/unifi/sites"),
        fetch(`/api/unifi/devices?siteId=${siteId}`),
      ]);

      if (sitesRes.status === "fulfilled" && sitesRes.value.ok) {
        const { data } = await sitesRes.value.json();
        const found = (data as UiEnrichedSite[]).find((s) => s.siteId === siteId);
        setSite(found ?? null);
      }

      if (devicesRes.status === "fulfilled" && devicesRes.value.ok) {
        const { data } = await devicesRes.value.json();
        setDevices(data ?? []);
      }
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    load();
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

  const sidebarStats = [
    { label: "Online",  value: online,         color: online > 0 ? "text-[#16a34a]" : "text-[#111]" },
    { label: "Offline", value: c.offlineDevice, color: c.offlineDevice > 0 ? "text-[#dc2626]" : "text-[#111]" },
    { label: "WiFi",    value: c.wifiClient,    color: "text-[#111]" },
    { label: "Wired",   value: c.wiredClient,   color: "text-[#111]" },
  ];

  return (
    <div className="-mx-4 -mt-6 -mb-6 md:-mx-8 md:-mt-8 md:-mb-8 min-h-screen bg-[#f8f8f8] flex flex-col">

      {/* Top bar */}
      <div className="bg-white border-b border-[#eaeaea] px-4 md:px-6 py-3 md:h-13 flex flex-wrap items-center justify-between gap-2 shrink-0">
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
              className={`inline-flex items-center gap-1 text-[11px] font-medium shrink-0 ${
                site.connected ? "text-[#16a34a]" : "text-[#6b7280]"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${site.connected ? "bg-[#22c55e]" : "bg-[#9ca3af]"}`} />
              {site.connected ? "Online" : "Offline"}
            </span>
            {c.criticalNotification > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-[#d97706] shrink-0">
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
            className="flex items-center gap-1.5 text-xs text-[#0070f3] hover:text-[#0051cc] border border-[#dbeafe] bg-[#eff6ff] px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            <ExternalLink className="w-3 h-3" />
            <span className="hidden sm:inline">Open in UniFi</span>
            <span className="sm:hidden">UniFi</span>
          </a>
          <button
            onClick={() => load(false)}
            className="flex items-center gap-1.5 text-xs text-[#555] hover:text-[#111] border border-[#eaeaea] px-3 py-1.5 rounded-lg bg-white transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Body — stacks on mobile */}
      <div className="flex flex-col md:flex-row flex-1 overflow-auto md:overflow-hidden">

        {/* Sidebar — full width on mobile, fixed w-64 on desktop */}
        <aside className="w-full md:w-64 shrink-0 bg-white border-b md:border-b-0 md:border-r border-[#eaeaea] md:overflow-y-auto">
          <div className="p-4">

            {/* Stats 2x2 */}
            <div className="grid grid-cols-2 gap-2 mb-5">
              {sidebarStats.map(({ label, value, color }) => (
                <div key={label} className="bg-[#f9f9f9] rounded-lg px-3 py-2.5">
                  <p className={`text-[20px] font-bold tabular-nums leading-none ${color}`}>{value}</p>
                  <p className="text-[10px] text-[#aaa] mt-1 font-medium uppercase tracking-wide">{label}</p>
                </div>
              ))}
            </div>

            {/* Divider + label */}
            <p className="text-[10px] font-semibold text-[#bbb] uppercase tracking-wider mb-2.5">Details</p>

            {/* Info rows */}
            <div>
              <InfoRow label="Gateway">
                <span className="break-words">{site.hardware.name || "-"}</span>
              </InfoRow>
              <InfoRow label="Model">
                {site.hardware.shortname || "-"}
              </InfoRow>
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
        <main className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Internet Activity */}
          <div className="bg-white rounded-xl border border-[#eaeaea]">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#f2f2f2]">
              <div>
                <h2 className="text-sm font-semibold text-[#111]">Internet Activity</h2>
                <p className="text-[11px] text-[#aaa] mt-0.5">Last 6 hours · 5 min intervals</p>
              </div>
              <div className="flex items-center gap-5 text-[11px] text-[#aaa]">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-5 h-0.5 bg-[#06b6d4] rounded-full" />
                  Avg Latency
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-5" style={{ borderTop: "1.5px dashed #bae6fd" }} />
                  Max Latency
                </span>
              </div>
            </div>
            <div className="px-3 pb-4 pt-3">
              <SiteLatencyChart issues={site.internetIssues} />
            </div>
          </div>

          {/* Devices */}
          <div className="bg-white rounded-xl border border-[#eaeaea]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#f2f2f2]">
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
                <div className="min-w-140">
                  <div className="grid grid-cols-[1fr_150px_120px_140px_90px] px-5 py-2.5 border-b border-[#f5f5f5] bg-[#fafafa]">
                    {["Name", "Model", "IP Address", "MAC", "Status"].map((h) => (
                      <span key={h} className="text-[10px] font-semibold text-[#aaa] uppercase tracking-wide">
                        {h}
                      </span>
                    ))}
                  </div>
                  <div className="divide-y divide-[#f8f8f8]">
                    {devices.map((d, i) => {
                      const isOnline  = d.status === "connected" || d.status === "online";
                      const isOffline = d.status === "offline"   || d.status === "disconnected";
                      return (
                        <div
                          key={`${d.id}-${i}`}
                          className="grid grid-cols-[1fr_150px_120px_140px_90px] px-5 py-3 hover:bg-[#fafafa] transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-[12px] text-[#111] font-medium truncate">{d.name || "-"}</p>
                            {d.type && (
                              <p className="text-[10px] text-[#bbb] mt-0.5 capitalize">{d.type}</p>
                            )}
                          </div>
                          <span className="text-[11px] text-[#666] self-center truncate">{d.model || "-"}</span>
                          <span className="text-[11px] text-[#666] font-mono self-center">{d.ip || "-"}</span>
                          <span className="text-[10px] text-[#999] font-mono self-center truncate">{d.mac || "-"}</span>
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
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Clients summary */}
          <div className="bg-white rounded-xl border border-[#eaeaea] px-5 py-4">
            <h2 className="text-sm font-semibold text-[#111] mb-3">Clients</h2>
            <div className="flex items-center gap-8">
              {[
                { icon: <Wifi className="w-3.5 h-3.5" />, label: "WiFi", value: c.wifiClient },
                { icon: <Server className="w-3.5 h-3.5" />, label: "Wired", value: c.wiredClient },
                { icon: <AlertCircle className="w-3.5 h-3.5" />, label: "Guest", value: c.guestClient },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="text-[#ccc]">{icon}</div>
                  <div>
                    <p className="text-base font-bold text-[#111] tabular-nums leading-none">{value}</p>
                    <p className="text-[10px] text-[#aaa] mt-0.5 font-medium">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
