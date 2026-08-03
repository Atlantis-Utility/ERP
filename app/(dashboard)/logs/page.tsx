"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Search, Trash2, Download, Users, FolderKanban, Settings,
  Shield, Wifi, Layers, LogIn, Filter, Bell, BellRing,
} from "lucide-react";
import Select from "@/components/ui/Select";
import { getLogs, clearLogs, type ActivityLogEntry, type LogCategory } from "@/lib/activity-log";
import { getInitials } from "@/lib/utils";

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<LogCategory, {
  label: string;
  bg: string;
  text: string;
  border: string;
  icon: React.ElementType;
}> = {
  auth:      { label: "Auth",      bg: "bg-[#f5f5f5]",   text: "text-[#444]",    border: "border-[#e5e5e5]",   icon: LogIn      },
  employees: { label: "Employees", bg: "bg-[#fafafa]",   text: "text-[#0a0a0a]", border: "border-[#eaeaea]",   icon: Users      },
  projects:  { label: "Projects",  bg: "bg-[#f0f4ff]",   text: "text-[#3b5bdb]", border: "border-[#c5d2f6]",   icon: FolderKanban },
  settings:  { label: "Settings",  bg: "bg-[#f5f5f5]",   text: "text-[#666]",    border: "border-[#e0e0e0]",   icon: Settings   },
  access:    { label: "Access",    bg: "bg-[#fffbeb]",   text: "text-[#b45309]", border: "border-[#fde68a]",   icon: Shield     },
  network:      { label: "Network",      bg: "bg-[#fef2f2]",   text: "text-[#b91c1c]", border: "border-[#fecaca]",   icon: Wifi       },
  system:       { label: "System",       bg: "bg-[#f0fdf4]",   text: "text-[#15803d]", border: "border-[#bbf7d0]",   icon: Layers     },
  notification: { label: "Notification", bg: "bg-[#f5f0ff]",   text: "text-[#7c3aed]", border: "border-[#ddd6fe]",   icon: BellRing   },
};

const ALL_CATEGORIES: LogCategory[] = ["auth", "employees", "projects", "settings", "access", "network", "system"];

const DATE_FILTERS = [
  { label: "All time", value: "all" },
  { label: "Today",    value: "today" },
  { label: "7 days",   value: "7d"   },
  { label: "30 days",  value: "30d"  },
] as const;

type DateFilter = (typeof DATE_FILTERS)[number]["value"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtTimestamp(ts: string): { date: string; time: string } {
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
  };
}

function withinDateFilter(ts: string, filter: DateFilter): boolean {
  if (filter === "all") return true;
  const now = Date.now();
  const t = new Date(ts).getTime();
  if (filter === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return t >= start.getTime();
  }
  if (filter === "7d")  return t >= now - 7  * 86_400_000;
  if (filter === "30d") return t >= now - 30 * 86_400_000;
  return true;
}

function downloadCSV(entries: ActivityLogEntry[]) {
  const header = ["Timestamp", "User", "Category", "Action", "Detail"].join(",");
  const rows = entries.map((e) =>
    [
      new Date(e.timestamp).toISOString(),
      `"${e.userName}"`,
      e.category,
      `"${e.action}"`,
      `"${e.detail.replace(/"/g, '""')}"`,
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `atlantis-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function UserAvatar({ name }: { name: string }) {
  const isAdmin = name === "Admin";
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
      isAdmin ? "bg-[#0a0a0a] text-white" : "bg-[#f1f1f1] text-[#444]"
    }`}>
      {getInitials(name)}
    </div>
  );
}

// ── Log Row ───────────────────────────────────────────────────────────────────

function LogRow({ entry }: { entry: ActivityLogEntry }) {
  const cat = CATEGORY_CONFIG[entry.category];
  const CatIcon = cat.icon;
  const { date, time } = fmtTimestamp(entry.timestamp);

  return (
    <tr className="border-b border-[#f8f8f8] last:border-0 hover:bg-[#fafafa] transition-colors">
      {/* Time */}
      <td className="px-4 py-3.5 w-36 shrink-0">
        <p className="text-xs font-medium text-[#0a0a0a] tabular-nums">{time}</p>
        <p className="text-[10px] text-[#bbb] mt-0.5">{date}</p>
        <p className="text-[10px] text-[#ddd] mt-0.5">{timeAgo(entry.timestamp)}</p>
      </td>

      {/* User */}
      <td className="px-4 py-3.5 w-36">
        <div className="flex items-center gap-2">
          <UserAvatar name={entry.userName} />
          <span className="text-xs font-medium text-[#0a0a0a] truncate max-w-24">{entry.userName}</span>
        </div>
      </td>

      {/* Category */}
      <td className="px-4 py-3.5 w-32">
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${cat.bg} ${cat.text} ${cat.border}`}>
          <CatIcon className="w-2.5 h-2.5 shrink-0" />
          {cat.label}
        </span>
      </td>

      {/* Action + Detail */}
      <td className="px-4 py-3.5">
        <p className="text-xs font-semibold text-[#0a0a0a] leading-tight">{entry.action}</p>
        <p className="text-[11px] text-[#666] mt-0.5 leading-snug">{entry.detail}</p>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const [logs, setLogs]             = useState<ActivityLogEntry[]>([]);
  const [search, setSearch]         = useState("");
  const [catFilter, setCatFilter]   = useState<LogCategory | "all" | "notifications">("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [isAdmin, setIsAdmin]       = useState(false);

  // Load on mount + live updates
  useEffect(() => {
    setLogs(getLogs());
    setIsAdmin(!localStorage.getItem("current_user_id"));
    const params = new URLSearchParams(window.location.search);
    if (params.get("filter") === "notifications") setCatFilter("notifications");
    function onEntry() { setLogs(getLogs()); }
    window.addEventListener("activity-log-entry", onEntry as EventListener);
    return () => window.removeEventListener("activity-log-entry", onEntry as EventListener);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return logs.filter((e) => {
      if (catFilter === "notifications") {
        if (!["notification", "network", "system"].includes(e.category)) return false;
      } else if (catFilter !== "all" && e.category !== catFilter) return false;
      if (!withinDateFilter(e.timestamp, dateFilter)) return false;
      if (q && !e.action.toLowerCase().includes(q) && !e.detail.toLowerCase().includes(q) && !e.userName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [logs, search, catFilter, dateFilter]);

  const notifCount = useMemo(
    () => logs.filter((e) => ["notification", "network", "system"].includes(e.category)).length,
    [logs]
  );

  // Category counts for the filter pills
  const catCounts = useMemo(() => {
    const counts: Partial<Record<LogCategory, number>> = {};
    logs.forEach((e) => { counts[e.category] = (counts[e.category] ?? 0) + 1; });
    return counts;
  }, [logs]);


  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0a0a0a] leading-tight">Activity Log</h1>
          <p className="text-sm text-[#999] mt-1">
            {logs.length.toLocaleString()} total entr{logs.length === 1 ? "y" : "ies"}, every change recorded
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadCSV(filtered)}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 border border-[#eaeaea] text-sm font-medium text-[#666] px-3 py-2 rounded-lg hover:bg-[#fafafa] hover:text-[#0a0a0a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          {isAdmin && (
            <div className="relative group">
              <button
                disabled
                className="flex items-center gap-1.5 border border-[#eaeaea] text-sm font-medium text-[#ccc] px-3 py-2 rounded-lg cursor-not-allowed select-none"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear logs
              </button>
              <div className="absolute right-0 top-full mt-2 w-64 bg-[#0a0a0a] text-white text-xs rounded-lg px-3 py-2.5 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 leading-relaxed">
                <div className="absolute right-6 bottom-full w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-[#0a0a0a]" />
                To clear logs, contact the technical team at{" "}
                <a className="underline text-[#93c5fd] pointer-events-auto" href="mailto:yash.h@atlantisutility.com">
                  yash.h@atlantisutility.com
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:flex md:items-stretch md:divide-x divide-[#f4f4f4] bg-white border border-[#eaeaea] rounded-xl mb-5 overflow-hidden">
        {[
          { label: "Total entries",  value: logs.length },
          { label: "Today",          value: logs.filter((e) => withinDateFilter(e.timestamp, "today")).length },
          { label: "This week",      value: logs.filter((e) => withinDateFilter(e.timestamp, "7d")).length },
          { label: "Unique users",   value: new Set(logs.map((e) => e.userId ?? "admin")).size },
        ].map(({ label, value }, i) => (
          <div key={label} className={`px-4 py-4 md:flex-1 md:px-5 md:py-5 ${i < 3 ? "border-b md:border-b-0 border-[#f4f4f4]" : ""}`}>
            <p className="text-2xl font-bold tabular-nums leading-none text-[#0a0a0a]">{value}</p>
            <p className="text-[11px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden mb-5">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#f4f4f4]">
          {/* Search */}
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#bbb]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actions, details, or users…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-[#eaeaea] rounded-lg focus:outline-none focus:border-[#999] transition-colors bg-[#fafafa]"
            />
          </div>

          {/* Date filter */}
          <div className="w-36">
            <Select
              value={dateFilter}
              onChange={(v) => setDateFilter(v as DateFilter)}
              options={DATE_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
            />
          </div>

          {filtered.length !== logs.length && (
            <span className="text-xs text-[#999]">
              Showing {filtered.length.toLocaleString()} of {logs.length.toLocaleString()}
            </span>
          )}
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <Filter className="w-3 h-3 text-[#bbb] shrink-0" />
          <button
            onClick={() => setCatFilter("all")}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              catFilter === "all"
                ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                : "bg-white text-[#666] border-[#eaeaea] hover:border-[#ccc]"
            }`}
          >
            All ({logs.length})
          </button>
          <button
            onClick={() => setCatFilter(catFilter === "notifications" ? "all" : "notifications")}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              catFilter === "notifications"
                ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                : "bg-white text-[#999] border-[#eaeaea] hover:border-[#ccc] hover:text-[#444]"
            }`}
          >
            <Bell className="w-2.5 h-2.5 shrink-0" />
            Notifications ({notifCount})
          </button>
          {ALL_CATEGORIES.filter((c) => (catCounts[c] ?? 0) > 0).map((cat) => {
            const cfg = CATEGORY_CONFIG[cat];
            const CatIcon = cfg.icon;
            const active = catFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setCatFilter(active ? "all" : cat)}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  active
                    ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                    : "bg-white text-[#999] border-[#eaeaea] hover:border-[#ccc] hover:text-[#444]"
                }`}
              >
                <CatIcon className="w-2.5 h-2.5 shrink-0" />
                {cfg.label} ({catCounts[cat] ?? 0})
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <Layers className="w-8 h-8 text-[#ddd] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#999]">
              {logs.length === 0 ? "No activity recorded yet" : "No entries match your filters"}
            </p>
            <p className="text-xs text-[#bbb] mt-1">
              {logs.length === 0
                ? "Actions like adding employees, editing projects, and changing settings will appear here"
                : "Try adjusting the search or category filter"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-[#eaeaea] bg-[#fafafa]">
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3 w-36">Time</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3 w-36">User</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3 w-32">Category</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Action &amp; Detail</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <LogRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
