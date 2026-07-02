"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import IspLogo from "@/components/unifi/IspLogo";
import {
  Wifi, AlertTriangle, CheckCircle, XCircle, Phone,
  ArrowRight, RefreshCw, PhoneIncoming, PhoneOutgoing, Clock,
  Users, FolderKanban, Settings, CalendarDays, CheckCheck,
} from "lucide-react";
import type { UiEnrichedSite } from "@/lib/unifi";
import {
  addNotification, getNotifications, markAllRead,
  type AppNotification,
} from "@/lib/notifications";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RLCDR {
  callid?: string;
  domain?: string;
  start_time?: string;
  duration?: string;
  orig_from_user?: string;
  dest_to_user?: string;
  direction?: string;
}

interface RLSummary {
  customers: number;
  dids: number;
  assignedDids: number;
  calls: number;
  totalBalance: number;
  recentCalls: RLCDR[];
}

interface UnifiSummary {
  total: number;
  online: number;
  offline: number;
  alerts: number;
  devicesOnline: number;
  devicesOffline: number;
  problemSites: UiEnrichedSite[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(t: string | undefined | null): string {
  if (!t) return "-";
  const m = Math.floor((Date.now() - new Date(t).getTime()) / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDuration(s: string | undefined) {
  if (!s) return "-";
  const n = parseInt(s, 10);
  if (isNaN(n)) return "-";
  if (n < 60) return `${n}s`;
  return `${Math.floor(n / 60)}m ${n % 60}s`;
}

function fmtNumber(n: string | undefined) {
  if (!n) return "-";
  const d = n.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return n;
}

function greetingPrefix(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Notification Panel ────────────────────────────────────────────────────────

function notifIconEl(icon: AppNotification["icon"]) {
  const cls = "w-3.5 h-3.5 text-[#666]";
  switch (icon) {
    case "user":    return <Users         className={cls} />;
    case "project": return <FolderKanban  className={cls} />;
    case "network": return <Wifi          className="w-3.5 h-3.5 text-[#d97706]" />;
    case "phone":   return <Phone         className={cls} />;
    case "system":  return <Settings      className={cls} />;
    case "leave":   return <CalendarDays  className={cls} />;
    default:        return <CheckCircle   className={cls} />;
  }
}

function NotificationPanel({
  notifs,
  onMarkAllRead,
}: {
  notifs: AppNotification[];
  onMarkAllRead: () => void;
}) {
  const unread = notifs.filter((n) => !n.read).length;

  return (
    <div className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#f4f4f4] shrink-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[#0a0a0a]">Notifications</p>
          {unread > 0 && (
            <span className="bg-[#0a0a0a] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {unread}
            </span>
          )}
        </div>
        {unread > 0 && (
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-1 text-[10px] font-medium text-[#666] hover:text-[#0a0a0a] transition-colors"
          >
            <CheckCheck className="w-3 h-3" /> Mark all read
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-[#f8f8f8]">
        {notifs.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <CheckCircle className="w-5 h-5 text-[#ddd] mx-auto mb-2" />
            <p className="text-xs text-[#999]">No notifications yet</p>
            <p className="text-[10px] text-[#bbb] mt-1">
              Activity from employees, projects, and network will appear here
            </p>
          </div>
        ) : (
          notifs.slice(0, 30).map((n) => {
            const row = (
              <div className={`flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[#fafafa] ${!n.read ? "bg-[#fafafa]" : ""}`}>
                <div className="p-1.5 rounded-lg bg-white border border-[#eaeaea] shrink-0 mt-0.5">
                  {notifIconEl(n.icon)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-snug truncate ${!n.read ? "font-semibold text-[#0a0a0a]" : "font-medium text-[#444]"}`}>
                    {n.title}
                  </p>
                  <p className="text-[10px] text-[#999] mt-0.5 truncate">{n.body}</p>
                  <p className="text-[10px] text-[#bbb] mt-0.5">{timeAgo(n.timestamp)}</p>
                </div>
                {!n.read && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0a0a0a] shrink-0 mt-1.5" />
                )}
              </div>
            );
            return n.href ? (
              <Link key={n.id} href={n.href}>{row}</Link>
            ) : (
              <div key={n.id}>{row}</div>
            );
          })
        )}
      </div>
      <div className="border-t border-[#f4f4f4] px-4 py-3 shrink-0">
        <Link
          href="/logs?filter=notifications"
          className="flex items-center justify-center gap-1.5 text-xs font-medium text-[#666] hover:text-[#0a0a0a] transition-colors"
        >
          View all notifications <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { authUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [appNotifs, setAppNotifs] = useState<AppNotification[]>([]);

  const [rl, setRl] = useState<RLSummary>({
    customers: 0, dids: 0, assignedDids: 0, calls: 0, totalBalance: 0, recentCalls: [],
  });
  const [unifi, setUnifi] = useState<UnifiSummary>({
    total: 0, online: 0, offline: 0, alerts: 0,
    devicesOnline: 0, devicesOffline: 0, problemSites: [],
  });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setSpinning(true);
    try {
      const [custR, didR, cdrR, billR, sitesR] = await Promise.allSettled([
        fetch("/api/ringlogix/customers").then((r) => r.json()),
        fetch("/api/ringlogix/dids").then((r) => r.json()),
        fetch("/api/ringlogix/cdr?limit=20").then((r) => r.json()),
        fetch("/api/ringlogix/billing").then((r) => r.json()),
        fetch("/api/unifi/sites").then((r) => r.json()),
      ]);

      const custRaw    = custR.status === "fulfilled" ? custR.value : null;
      const custArr    = Array.isArray(custRaw) ? custRaw : (custRaw?.data ?? []);
      const customers  = custArr.length;
      const didRaw     = didR.status === "fulfilled" ? didR.value : null;
      const didsArr    = Array.isArray(didRaw) ? didRaw : (didRaw?.data ?? []);
      const cdrRaw     = cdrR.status === "fulfilled" ? cdrR.value : null;
      const cdrsArr    = Array.isArray(cdrRaw) ? cdrRaw : (cdrRaw?.data ?? []);
      const billRaw    = billR.status === "fulfilled" ? billR.value : null;
      const billArr    = Array.isArray(billRaw) ? billRaw : (billRaw?.data ?? []);
      const sites: UiEnrichedSite[] = sitesR.status === "fulfilled" ? (sitesR.value?.data ?? []) : [];


      setRl({
        customers,
        dids:         didsArr.length,
        assignedDids: didsArr.filter((d: { subscriber?: string }) => d.subscriber).length,
        calls:        cdrsArr.length,
        totalBalance: billArr.reduce((s: number, c: { balance?: string }) => s + parseFloat(c.balance ?? "0"), 0),
        recentCalls:  cdrsArr.slice(0, 8),
      });

      const online         = sites.filter((s) => s.connected).length;
      const offline        = sites.filter((s) => !s.connected).length;
      const alertsCount    = sites.reduce((n, s) => n + s.statistics.counts.criticalNotification, 0);
      const devicesOnline  = sites.reduce((n, s) => n + s.statistics.counts.totalDevice - s.statistics.counts.offlineDevice, 0);
      const devicesOffline = sites.reduce((n, s) => n + s.statistics.counts.offlineDevice, 0);

      setUnifi({
        total: sites.length, online, offline, alerts: alertsCount,
        devicesOnline, devicesOffline,
        problemSites:  sites.filter((s) => !s.connected || s.statistics.counts.criticalNotification > 0).slice(0, 5),
      });

      // Detect offline ↔ online transitions
      const prevOfflineRaw = localStorage.getItem("dashboard_last_offline_sites");
      const prevOffline: Set<string> = new Set(prevOfflineRaw ? JSON.parse(prevOfflineRaw) : []);

      sites.filter((s) => !s.connected).forEach((site) => {
        if (!prevOffline.has(site.siteId)) {
          addNotification({
            prefId: "n-6",
            icon: "network",
            title: "Site went offline",
            body: site.displayName + (site.ispName ? ` · ${site.ispName}` : ""),
            href: `/sites/${site.siteId}`,
          });
        }
      });

      // Site came back online
      sites.filter((s) => s.connected && prevOffline.has(s.siteId)).forEach((site) => {
        addNotification({
          prefId: "n-6",
          icon: "network",
          title: "Site back online",
          body: site.displayName + (site.ispName ? ` · ${site.ispName}` : ""),
          href: `/sites/${site.siteId}`,
        });
      });

      localStorage.setItem(
        "dashboard_last_offline_sites",
        JSON.stringify(sites.filter((s) => !s.connected).map((s) => s.siteId))
      );

      // Detect packet loss (new sites only)
      const prevPLRaw = localStorage.getItem("dashboard_last_packetloss_sites");
      const prevPL: Set<string> = new Set(prevPLRaw ? JSON.parse(prevPLRaw) : []);
      const plSites = sites.filter((s) => s.internetIssues.some((p) => p.packetLoss));
      plSites.forEach((site) => {
        if (!prevPL.has(site.siteId)) {
          addNotification({
            prefId: "n-6",
            icon: "network",
            title: "Packet loss detected",
            body: site.displayName + (site.ispName ? ` · ${site.ispName}` : ""),
            href: `/sites/${site.siteId}`,
          });
        }
      });
      localStorage.setItem(
        "dashboard_last_packetloss_sites",
        JSON.stringify(plSites.map((s) => s.siteId))
      );

      // Detect high latency (new sites only)
      const prevHLRaw = localStorage.getItem("dashboard_last_highlat_sites");
      const prevHL: Set<string> = new Set(prevHLRaw ? JSON.parse(prevHLRaw) : []);
      const hlSites = sites.filter((s) => s.internetIssues.some((p) => p.highLatency));
      hlSites.forEach((site) => {
        if (!prevHL.has(site.siteId)) {
          const hlPeriods = site.internetIssues.filter((p) => p.highLatency);
          const maxMs = Math.max(...hlPeriods.map((p) => p.latencyMaxMs ?? 0));
          const avgMs = Math.round(
            hlPeriods.reduce((s, p) => s + (p.latencyAvgMs ?? 0), 0) / hlPeriods.length
          );
          addNotification({
            prefId: "n-6",
            icon: "network",
            title: "High latency detected",
            body: `${site.displayName}${maxMs > 0 ? ` · avg ${avgMs}ms, max ${maxMs}ms` : ""}${site.ispName ? ` · ${site.ispName}` : ""}`,
            href: `/sites/${site.siteId}`,
          });
        }
      });
      localStorage.setItem(
        "dashboard_last_highlat_sites",
        JSON.stringify(hlSites.map((s) => s.siteId))
      );

      // Detect sites with new critical alerts and fire notifications
      const prevAlertRaw = localStorage.getItem("dashboard_last_alert_sites");
      const prevAlert: Set<string> = new Set(prevAlertRaw ? JSON.parse(prevAlertRaw) : []);
      sites.filter((s) => s.statistics.counts.criticalNotification > 0).forEach((site) => {
        if (!prevAlert.has(site.siteId)) {
          addNotification({
            prefId: "n-7",
            icon: "network",
            title: "Site has active alerts",
            body: `${site.displayName} · ${site.statistics.counts.criticalNotification} critical alert${site.statistics.counts.criticalNotification > 1 ? "s" : ""}`,
            href: `/alerts`,
          });
        }
      });
      localStorage.setItem(
        "dashboard_last_alert_sites",
        JSON.stringify(sites.filter((s) => s.statistics.counts.criticalNotification > 0).map((s) => s.siteId))
      );
      setAppNotifs(getNotifications());

      setLastUpdated(new Date());
    } catch {
      // silently fail — sections show what they can
    } finally {
      setLoading(false);
      setSpinning(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(() => load(true), 60_000);
    return () => clearInterval(iv);
  }, [load]);

  // Load notifications on mount and subscribe to live updates
  useEffect(() => {
    setAppNotifs(getNotifications());
    function onNotif() { setAppNotifs(getNotifications()); }
    window.addEventListener("app-notification", onNotif as EventListener);
    return () => window.removeEventListener("app-notification", onNotif as EventListener);
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  const systemHealthy = !loading && unifi.offline === 0 && unifi.alerts === 0 && unifi.devicesOffline === 0;

  // KPI strip — color only for status-meaningful values
  const kpis = [
    { value: rl.customers,       label: "Customers",      sub: "Total accounts",                                        href: "/customers"     },
    { value: rl.dids,            label: "Phone Numbers",  sub: `${rl.assignedDids} assigned`,                           href: "/phone-numbers" },
    { value: unifi.online,       label: "Sites Online",   sub: `of ${unifi.total} total`,   valueColor: unifi.online > 0 && unifi.offline === 0 ? "text-[#16a34a]" : undefined, href: "/sites"   },
    { value: unifi.offline,      label: "Sites Offline",  sub: unifi.offline > 0 ? "Needs attention" : "All connected", valueColor: unifi.offline > 0 ? "text-[#dc2626]" : undefined, href: "/sites"   },
    { value: unifi.alerts,       label: "Active Alerts",  sub: unifi.alerts > 0 ? "Needs review" : "All clear",        valueColor: unifi.alerts > 0 ? "text-[#d97706]" : undefined, href: "/alerts"  },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-[#0a0a0a] leading-tight">
            {greetingPrefix()}{authUser?.displayName ? `, ${authUser.displayName.split(" ")[0]}` : ""}
          </h1>
          <p className="text-sm text-[#999] mt-1">{today}</p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && (
            <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${
              systemHealthy
                ? "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]"
                : "bg-[#fffbeb] text-[#b45309] border-[#fde68a]"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${systemHealthy ? "bg-[#16a34a]" : "bg-[#d97706]"}`} />
              {systemHealthy ? "All systems operational" : "Issues detected"}
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-[#bbb]">
            {lastUpdated && (
              <span>
                Updated {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
              </span>
            )}
            <button
              onClick={() => load(true)}
              className="p-1.5 rounded-lg border border-[#eaeaea] text-[#999] hover:text-[#0a0a0a] hover:border-[#ccc] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${spinning ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:items-stretch md:divide-x divide-[#f4f4f4] bg-white border border-[#eaeaea] rounded-xl mb-4 overflow-hidden shrink-0">
        {kpis.map((k, i) => (
          <Link
            key={k.label}
            href={k.href}
            className={`px-4 py-4 md:flex-1 md:px-5 md:py-5 hover:bg-[#fafafa] transition-colors ${
              i < kpis.length - 1 ? "border-b md:border-b-0 border-[#f4f4f4]" : ""
            }`}
          >
            {loading ? (
              <div className="h-7 w-12 bg-[#f1f1f1] rounded animate-pulse mb-1.5" />
            ) : (
              <p className={`text-2xl font-bold tabular-nums leading-none ${k.valueColor ?? "text-[#0a0a0a]"}`}>
                {k.value}
              </p>
            )}
            <p className="text-[11px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">{k.label}</p>
            <p className={`text-[10px] mt-0.5 ${"subColor" in k && k.subColor ? k.subColor : "text-[#bbb]"}`}>{k.sub}</p>
          </Link>
        ))}
      </div>

      {/* ── Main grid ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">

        {/* Left: Network + Communications */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">

          {/* Network · UniFi */}
          <div className="flex flex-col flex-1 min-h-0 bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f4f4f4]">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-[#fafafa] border border-[#f0f0f0]">
                  <Wifi className="w-3.5 h-3.5 text-[#666]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0a0a0a]">Network</p>
                  <p className="text-[10px] text-[#999]">UniFi · real-time</p>
                </div>
              </div>
              <Link href="/sites" className="flex items-center gap-1 text-xs text-[#666] hover:text-[#0a0a0a] transition-colors font-medium">
                All sites <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 divide-x divide-[#f4f4f4] border-b border-[#f4f4f4]">
              {[
                { label: "Total",   value: unifi.total,   color: "" },
                { label: "Online",  value: unifi.online,  color: unifi.online  > 0 && unifi.offline === 0 ? "text-[#16a34a]" : "" },
                { label: "Offline", value: unifi.offline, color: unifi.offline > 0 ? "text-[#dc2626]" : "" },
                { label: "Alerts",  value: unifi.alerts,  color: unifi.alerts  > 0 ? "text-[#d97706]" : "" },
              ].map(({ label, value, color }) => (
                <div key={label} className="py-3 text-center">
                  {loading ? (
                    <div className="h-5 w-7 bg-[#f1f1f1] rounded animate-pulse mx-auto mb-1" />
                  ) : (
                    <p className={`text-lg font-semibold tabular-nums ${color || "text-[#0a0a0a]"}`}>{value}</p>
                  )}
                  <p className="text-[10px] text-[#bbb]">{label}</p>
                </div>
              ))}
            </div>

            {/* Problem sites */}
            {!loading && unifi.problemSites.length === 0 ? (
              <div className="px-5 py-5 flex items-center gap-2.5 text-sm text-[#16a34a]">
                <CheckCircle className="w-4 h-4" />
                <span>All sites are healthy</span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="px-5 py-3 flex items-center gap-3 border-b border-[#f8f8f8] last:border-0">
                        <div className="w-2 h-2 rounded-full bg-[#f1f1f1] animate-pulse shrink-0" />
                        <div className="h-3 w-44 bg-[#f1f1f1] rounded animate-pulse" />
                        <div className="h-3 w-16 bg-[#f1f1f1] rounded animate-pulse ml-auto" />
                      </div>
                    ))
                  : unifi.problemSites.map((site) => (
                      <Link
                        key={site.siteId}
                        href={`/sites/${site.siteId}`}
                        className="flex items-center justify-between px-5 py-3 border-b border-[#f8f8f8] last:border-0 hover:bg-[#fafafa] transition-colors group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${site.connected ? "bg-[#d97706]" : "bg-[#dc2626]"}`} />
                          <span className="text-sm text-[#0a0a0a] font-medium truncate group-hover:text-[#444] transition-colors">
                            {site.displayName}
                          </span>
                          {site.ispName && (
                            <div className="flex items-center gap-1 shrink-0">
                              <IspLogo ispName={site.ispName} size={12} />
                              <span className="text-[10px] text-[#bbb] hidden sm:block">{site.ispName}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {site.statistics.counts.criticalNotification > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[#d97706]">
                              <AlertTriangle className="w-3 h-3" />
                              {site.statistics.counts.criticalNotification}
                            </span>
                          )}
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                            site.connected
                              ? "bg-[#fffbeb] text-[#b45309] border-[#fde68a]"
                              : "bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]"
                          }`}>
                            {site.connected ? "Alerts" : "Offline"}
                          </span>
                        </div>
                      </Link>
                    ))}

                {!loading && unifi.problemSites.length > 0 && (
                  <div className="px-5 py-3 border-t border-[#f4f4f4]">
                    <Link href="/alerts" className="flex items-center gap-1 text-xs text-[#666] hover:text-[#0a0a0a] transition-colors font-medium">
                      View all alerts <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Communications · RingLogix */}
          <div className="flex flex-col flex-1 min-h-0 bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f4f4f4]">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-[#fafafa] border border-[#f0f0f0]">
                  <Phone className="w-3.5 h-3.5 text-[#666]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0a0a0a]">Communications</p>
                  <p className="text-[10px] text-[#999]">RingLogix · live CDR</p>
                </div>
              </div>
              <Link href="/call-records" className="flex items-center gap-1 text-xs text-[#666] hover:text-[#0a0a0a] transition-colors font-medium">
                All calls <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 divide-x divide-[#f4f4f4] border-b border-[#f4f4f4]">
              {[
                { label: "Customers",    value: rl.customers                                    },
                { label: "Phone Nums",   value: rl.dids                                         },
                { label: "Assigned",     value: rl.assignedDids                                 },
                { label: "Balance",      value: rl.totalBalance > 0 ? `$${rl.totalBalance.toFixed(0)}` : "$0" },
              ].map(({ label, value }) => (
                <div key={label} className="py-3 text-center">
                  {loading ? (
                    <div className="h-5 w-10 bg-[#f1f1f1] rounded animate-pulse mx-auto mb-1" />
                  ) : (
                    <p className="text-lg font-semibold tabular-nums text-[#0a0a0a]">{value}</p>
                  )}
                  <p className="text-[10px] text-[#bbb]">{label}</p>
                </div>
              ))}
            </div>

            {/* Recent calls */}
            {!loading && rl.recentCalls.length === 0 ? (
              <div className="px-5 py-5 text-sm text-[#999]">No recent call records</div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="px-5 py-3 flex items-center gap-3 border-b border-[#f8f8f8] last:border-0">
                        <div className="w-7 h-7 rounded-lg bg-[#f1f1f1] animate-pulse shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-48 bg-[#f1f1f1] rounded animate-pulse" />
                          <div className="h-2.5 w-24 bg-[#f1f1f1] rounded animate-pulse" />
                        </div>
                      </div>
                    ))
                  : rl.recentCalls.map((call, i) => {
                      const isIn = call.direction?.toLowerCase().includes("in");
                      return (
                        <div key={call.callid ?? i} className="flex items-center gap-3 px-5 py-3 border-b border-[#f8f8f8] last:border-0 hover:bg-[#fafafa] transition-colors">
                          <div className="p-1.5 rounded-lg bg-[#fafafa] border border-[#f0f0f0] shrink-0">
                            {isIn
                              ? <PhoneIncoming className="w-3.5 h-3.5 text-[#666]" />
                              : <PhoneOutgoing className="w-3.5 h-3.5 text-[#666]" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[#0a0a0a] font-medium truncate">
                              {fmtNumber(call.orig_from_user)}
                              <span className="text-[#ccc] mx-1.5 font-normal">→</span>
                              {fmtNumber(call.dest_to_user)}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {call.domain && <span className="text-[10px] text-[#bbb]">{call.domain}</span>}
                              <Clock className="w-2.5 h-2.5 text-[#ddd]" />
                              <span className="text-[10px] text-[#bbb]">{fmtDuration(call.duration)}</span>
                              <span className="text-[10px] text-[#ccc]">
                                {isIn ? "Inbound" : "Outbound"}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] text-[#bbb] tabular-nums shrink-0">{timeAgo(call.start_time)}</span>
                        </div>
                      );
                    })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Notification log */}
        <div className="lg:col-span-1 min-h-0">
          <NotificationPanel
            notifs={appNotifs}
            onMarkAllRead={() => { markAllRead(); setAppNotifs(getNotifications()); }}
          />
        </div>

      </div>
    </div>
  );
}
