"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import IspLogo from "@/components/unifi/IspLogo";
import {
  Wifi, AlertTriangle, CheckCircle, Phone,
  ArrowRight, RefreshCw,
  Users, FolderKanban, Settings, CalendarDays, CheckCheck,
  DollarSign, Bell,
} from "lucide-react";
import type { UiEnrichedSite } from "@/lib/unifi";
import {
  addNotification, getNotifications, markAllRead,
  type AppNotification,
} from "@/lib/notifications";
import { subscribeProjects } from "@/lib/db/projects";
import type { Project } from "@/lib/mock-projects";
import { subscribeTasks } from "@/lib/db/tasks";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";
import type { PortalCustomer } from "@/lib/ringlogix-portal";
import { balanceAmount } from "@/lib/customer-status";
import Select from "@/components/ui/Select";
import ProjectTimelineChart, { TIMELINE_SERIES } from "@/components/dashboard/ProjectTimelineChart";
import TodaySchedule from "@/components/dashboard/TodaySchedule";

const TIMELINE_RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "week",  label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "3",      label: "Next 3 Months" },
  { value: "6",      label: "Next 6 Months" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

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
    <div className="flex flex-col h-full bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#f4f4f4] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-[#fafafa] border border-[#f0f0f0]">
            <Bell className="w-3.5 h-3.5 text-[#666]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[#0a0a0a]">Notifications</p>
              {unread > 0 && (
                <span className="bg-[#0a0a0a] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {unread}
                </span>
              )}
            </div>
            <p className="text-[10px] text-[#999]">Recent activity</p>
          </div>
        </div>
        {unread > 0 && (
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-1 text-[10px] font-medium text-[#666] hover:text-[#0a0a0a] transition-colors shrink-0"
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

function deriveUnifiSummary(sites: UiEnrichedSite[]): UnifiSummary {
  return {
    total: sites.length,
    online: sites.filter((s) => s.connected).length,
    offline: sites.filter((s) => !s.connected).length,
    alerts: sites.reduce((n, s) => n + s.statistics.counts.criticalNotification, 0),
    devicesOnline: sites.reduce((n, s) => n + s.statistics.counts.totalDevice - s.statistics.counts.offlineDevice, 0),
    devicesOffline: sites.reduce((n, s) => n + s.statistics.counts.offlineDevice, 0),
    problemSites: sites.filter((s) => !s.connected || s.statistics.counts.criticalNotification > 0).slice(0, 5),
  };
}

// ── Business / decision-making helpers ───────────────────────────────────────

/** Whole-days between today and a date string, rounded up so "tomorrow" reads as 1, not 0.9. */
function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr.split("T")[0] + "T00:00:00");
  return Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
}


// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { authUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [appNotifs, setAppNotifs] = useState<AppNotification[]>([]);

  const [unifi, setUnifi] = useState<UnifiSummary>({
    total: 0, online: 0, offline: 0, alerts: 0,
    devicesOnline: 0, devicesOffline: 0, problemSites: [],
  });

  const [projects, setProjects] = useState<Project[]>([]);
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [customers, setCustomers] = useState<PortalCustomer[]>([]);
  const [timelineRange, setTimelineRange] = useState<"today" | "week" | "month" | "3" | "6">("6");
  const [topPanelTab, setTopPanelTab] = useState<"timeline" | "schedule">("timeline");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setSpinning(true);
    try {
      const sitesJson = await fetch("/api/unifi/sites").then((r) => r.json());
      const sites: UiEnrichedSite[] = sitesJson?.data ?? [];

      setUnifi(deriveUnifiSummary(sites));
      try { localStorage.setItem("sc:sites", JSON.stringify(sites)); } catch {}

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
    // Paint instantly from whatever DataPreloader (or a prior visit) already
    // cached, then refresh silently in the background instead of blocking
    // the whole KPI strip on a fresh network round-trip.
    let hasCache = false;
    try {
      const cached = localStorage.getItem("sc:sites");
      if (cached) {
        setUnifi(deriveUnifiSummary(JSON.parse(cached)));
        setLoading(false);
        hasCache = true;
      }
    } catch {}

    load(hasCache);
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

  // Projects — for upcoming/overdue deadline tracking
  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:projects");
      if (c) setProjects(JSON.parse(c));
    } catch {}
    const unsub = subscribeProjects((ps) => {
      setProjects(ps);
      try { localStorage.setItem("sc:projects", JSON.stringify(ps)); } catch {}
    });
    return unsub;
  }, []);

  // Tasks/meetings — for upcoming meeting tracking
  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:tasks");
      if (c) setCards(JSON.parse(c));
    } catch {}
    const unsub = subscribeTasks((cs) => {
      setCards(cs);
      try { localStorage.setItem("sc:tasks", JSON.stringify(cs)); } catch {}
    });
    return unsub;
  }, []);

  // Customers — for unpaid-balance tracking
  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:customers");
      if (c) setCustomers(JSON.parse(c));
    } catch {}
    fetch("/api/ringlogix/customers")
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        const arr: PortalCustomer[] = Array.isArray(data) ? data : [];
        setCustomers(arr);
        try { localStorage.setItem("sc:customers", JSON.stringify(arr)); } catch {}
      })
      .catch(() => {});
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  // Business KPIs derived from projects, meetings, and customer billing data
  const activeProjectsWithDays = projects
    .filter((p) => p.status !== "completed" && !p.deadlineTbd && p.deadline)
    .map((p) => ({ ...p, daysLeft: daysUntil(p.deadline) }));
  const overdueProjects = activeProjectsWithDays.filter((p) => p.daysLeft < 0).sort((a, b) => a.daysLeft - b.daysLeft);
  const upcomingDeadlines = activeProjectsWithDays.filter((p) => p.daysLeft >= 0 && p.daysLeft <= 7).sort((a, b) => a.daysLeft - b.daysLeft);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysMeetings = cards.filter((c) => c.type === "meeting" && c.column !== "done" && c.meetingDate === todayStr);

  const unpaidCustomers = customers
    .map((c) => ({ ...c, owed: balanceAmount(c.balance) }))
    .filter((c) => c.owed > 0)
    .sort((a, b) => b.owed - a.owed);
  const totalOwed = unpaidCustomers.reduce((s, c) => s + c.owed, 0);

  // Same status colors used on the Projects page badges — kept in sync so a
  // color always means the same thing across the app.
  const projectStatusSlices = [
    { key: "active",    label: "Active",    count: projects.filter((p) => p.status === "active").length,    color: "#818cf8" },
    { key: "completed", label: "Completed", count: projects.filter((p) => p.status === "completed").length, color: "#22c55e" },
    { key: "on-hold",   label: "On Hold",   count: projects.filter((p) => p.status === "on-hold").length,   color: "#fbbf24" },
    { key: "overdue",   label: "Overdue",   count: projects.filter((p) => p.status === "overdue").length,   color: "#fb923c" },
  ];

  // Project timeline — real deadlines bucketed by the selected range, never fabricated history
  const timelineMonths = (() => {
    const now = new Date();
    const validProjects = projects.filter((p) => !p.deadlineTbd && p.deadline);

    function emptyBucket(key: string, label: string) {
      return { key, label, active: 0, completed: 0, onHold: 0, overdue: 0 };
    }
    function tally(bucket: { active: number; completed: number; onHold: number; overdue: number }, status: string) {
      if (status === "active") bucket.active++;
      else if (status === "completed") bucket.completed++;
      else if (status === "on-hold") bucket.onHold++;
      else if (status === "overdue") bucket.overdue++;
    }

    if (timelineRange === "today" || timelineRange === "week") {
      const bucket = emptyBucket(timelineRange, timelineRange === "today" ? "Today" : "This Week");
      const maxDays = timelineRange === "today" ? 0 : 6;
      for (const p of validProjects) {
        const days = daysUntil(p.deadline);
        if (days >= 0 && days <= maxDays) tally(bucket, p.status);
      }
      return [bucket];
    }

    if (timelineRange === "month") {
      const bucket = emptyBucket(`${now.getFullYear()}-${now.getMonth()}`, now.toLocaleDateString("en-US", { month: "long" }));
      for (const p of validProjects) {
        const d = new Date(p.deadline.split("T")[0] + "T00:00:00");
        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) tally(bucket, p.status);
      }
      return [bucket];
    }

    const monthCount = Number(timelineRange);
    const months = Array.from({ length: monthCount }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return emptyBucket(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, d.toLocaleDateString("en-US", { month: "short" }));
    });
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const p of validProjects) {
      const d = new Date(p.deadline.split("T")[0] + "T00:00:00");
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = byKey.get(key);
      if (bucket) tally(bucket, p.status);
    }
    return months;
  })();

  const kpiCards = [
    { key: "deadlines",    label: "Deadlines This Week", value: upcomingDeadlines.length, href: "/projects" },
    { key: "overdue",      label: "Overdue Projects",    value: overdueProjects.length,   href: "/projects" },
    { key: "unpaid",       label: "Unpaid Customers",    value: unpaidCustomers.length,   href: "/customers" },
    { key: "sitesOnline",  label: "Sites Online",        value: unifi.online,             href: "/sites" },
    { key: "meetingsToday",label: "Meetings Today",      value: todaysMeetings.length,    href: "/tasks" },
  ];

  return (
    <div>
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-[#0a0a0a] leading-tight">
            {greetingPrefix()}{authUser?.displayName ? `, ${authUser.displayName.split(" ")[0]}` : ""}
          </h1>
          <p className="text-sm text-[#999] mt-1">{today}</p>
        </div>
        <div className="flex items-center gap-3">
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

      {/* ── KPI strip ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 md:flex md:items-stretch md:divide-x divide-[#f4f4f4] bg-white border border-[#eaeaea] rounded-xl mb-4 overflow-hidden">
        {kpiCards.map((k, i, arr) => (
          <Link
            key={k.key}
            href={k.href}
            className={`px-4 py-4 md:flex-1 md:px-5 md:py-5 hover:bg-[#fafafa] transition-colors ${
              i < arr.length - 1 ? "border-b md:border-b-0 border-[#f4f4f4]" : ""
            }`}
          >
            {loading ? (
              <div className="h-7 w-12 bg-[#f1f1f1] rounded animate-pulse mb-1.5" />
            ) : (
              <p className="text-2xl font-bold tabular-nums leading-none text-[#0a0a0a]">{k.value}</p>
            )}
            <p className="text-[11px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">{k.label}</p>
          </Link>
        ))}
      </div>

      {/* ── Project Timeline / Today's Schedule · Recent Activity ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 mb-4 lg:h-105">
        <div className="lg:col-span-7 flex flex-col h-full bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-[#f4f4f4] shrink-0">
            <div className="flex items-center gap-1 bg-[#f4f4f5] rounded-lg p-1">
              <button
                onClick={() => setTopPanelTab("timeline")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  topPanelTab === "timeline" ? "bg-white text-[#0a0a0a] shadow-sm" : "text-[#666] hover:text-[#0a0a0a]"
                }`}
              >
                Project Timeline
              </button>
              <button
                onClick={() => setTopPanelTab("schedule")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  topPanelTab === "schedule" ? "bg-white text-[#0a0a0a] shadow-sm" : "text-[#666] hover:text-[#0a0a0a]"
                }`}
              >
                Today&apos;s Schedule
              </button>
            </div>

            {topPanelTab === "timeline" ? (
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {TIMELINE_SERIES.map((s) => (
                    <div key={s.key} className="flex items-center gap-1.5">
                      <span className="w-1 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-xs text-[#666]">{s.label}</span>
                    </div>
                  ))}
                </div>
                <div className="w-40">
                  <Select
                    value={timelineRange}
                    onChange={(v) => setTimelineRange(v as "today" | "week" | "month" | "3" | "6")}
                    options={TIMELINE_RANGE_OPTIONS}
                  />
                </div>
              </div>
            ) : (
              <Link href="/tasks" className="flex items-center gap-1 text-xs text-[#666] hover:text-[#0a0a0a] transition-colors font-medium">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
          <div className="flex-1 min-h-0">
            {topPanelTab === "timeline" ? (
              <div className="h-full p-5">
                <ProjectTimelineChart data={timelineMonths} />
              </div>
            ) : (
              <TodaySchedule cards={cards} />
            )}
          </div>
        </div>

        <div className="lg:col-span-3 min-h-0">
          <NotificationPanel
            notifs={appNotifs}
            onMarkAllRead={() => { markAllRead(); setAppNotifs(getNotifications()); }}
          />
        </div>
      </div>

      {/* ── Network · Customers needing attention ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 lg:h-105">
        {/* Network */}
        <div className="flex flex-col h-full bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#f4f4f4] shrink-0">
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
          <div className="grid grid-cols-4 divide-x divide-[#f4f4f4] border-b border-[#f4f4f4] shrink-0">
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

        {/* Customers needing attention */}
        <div className="flex flex-col h-full bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#f4f4f4] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-[#fafafa] border border-[#f0f0f0]">
                <DollarSign className="w-3.5 h-3.5 text-[#666]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#0a0a0a]">Customers Needing Attention</p>
                <p className="text-[10px] text-[#999]">Outstanding balances</p>
              </div>
            </div>
            <Link href="/customers" className="flex items-center gap-1 text-xs text-[#666] hover:text-[#0a0a0a] transition-colors font-medium">
              All customers <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 divide-x divide-[#f4f4f4] border-b border-[#f4f4f4] shrink-0">
            {[
              { label: "Total",      value: customers.length,       color: "" },
              { label: "Unpaid",     value: unpaidCustomers.length, color: unpaidCustomers.length > 0 ? "text-[#dc2626]" : "" },
              { label: "Total Owed", value: `$${totalOwed.toFixed(0)}`, color: totalOwed > 0 ? "text-[#dc2626]" : "" },
              { label: "Highest",    value: `$${(unpaidCustomers[0]?.owed ?? 0).toFixed(0)}`, color: unpaidCustomers.length > 0 ? "text-[#d97706]" : "" },
            ].map(({ label, value, color }) => (
              <div key={label} className="py-3 text-center">
                {loading ? (
                  <div className="h-5 w-10 bg-[#f1f1f1] rounded animate-pulse mx-auto mb-1" />
                ) : (
                  <p className={`text-lg font-semibold tabular-nums ${color || "text-[#0a0a0a]"}`}>{value}</p>
                )}
                <p className="text-[10px] text-[#bbb]">{label}</p>
              </div>
            ))}
          </div>

          {/* Unpaid customers */}
          {unpaidCustomers.length === 0 ? (
            <div className="px-5 py-5 flex items-center gap-2.5 text-sm text-[#16a34a]">
              <CheckCircle className="w-4 h-4" />
              <span>No outstanding balances</span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {unpaidCustomers.slice(0, 5).map((c) => (
                <Link
                  key={`${c.id}-${c.parentId}`}
                  href={`/customers/${c.id}`}
                  className="flex items-center justify-between px-5 py-3 border-b border-[#f8f8f8] last:border-0 hover:bg-[#fafafa] transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-[#f97316] shrink-0" />
                    <span className="text-sm text-[#0a0a0a] font-medium truncate group-hover:text-[#444] transition-colors">
                      {c.company}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[#d97706]">
                      <AlertTriangle className="w-3 h-3" />
                      1
                    </span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-[#fffbeb] text-[#b45309] border-[#fde68a]">
                      ${c.owed.toFixed(0)}
                    </span>
                  </div>
                </Link>
              ))}

              {unpaidCustomers.length > 0 && (
                <div className="px-5 py-3 border-t border-[#f4f4f4]">
                  <Link href="/customers" className="flex items-center gap-1 text-xs text-[#666] hover:text-[#0a0a0a] transition-colors font-medium">
                    View all unpaid <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
