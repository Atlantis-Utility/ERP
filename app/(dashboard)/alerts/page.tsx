"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import type { UiAlert } from "@/lib/unifi";

type ViewState = "loading" | "unconfigured" | "error" | "ok";
type Filter = "open" | "resolved" | "all";

const SEV: Record<string, { dot: string; text: string; bg: string; border: string; label: string }> = {
  critical: { dot: "#dc2626", text: "text-[#dc2626]", bg: "bg-[#fef2f2]", border: "border-[#fecaca]", label: "Critical" },
  high:     { dot: "#d97706", text: "text-[#d97706]", bg: "bg-[#fffbeb]", border: "border-[#fde68a]", label: "High"     },
  warning:  { dot: "#d97706", text: "text-[#d97706]", bg: "bg-[#fffbeb]", border: "border-[#fde68a]", label: "Warning"  },
  info:     { dot: "#2563eb", text: "text-[#2563eb]", bg: "bg-[#eff6ff]", border: "border-[#bfdbfe]", label: "Info"     },
  low:      { dot: "#9ca3af", text: "text-[#6b7280]", bg: "bg-[#f9fafb]", border: "border-[#e5e7eb]", label: "Low"      },
};

function getSev(s: string | undefined) {
  return SEV[s?.toLowerCase() ?? ""] ?? SEV.info;
}

function formatTime(t: string | undefined | null) {
  if (!t) return "-";
  try {
    return new Date(t).toLocaleString("en-US", {
      month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch { return t; }
}

function humanType(type: string | undefined) {
  if (!type) return "";
  return type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AlertsPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [alerts, setAlerts] = useState<UiAlert[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setState("loading");
    try {
      const res = await fetch("/api/unifi/alerts");
      if (res.status === 503) { if (!silent) setState("unconfigured"); return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      const arr: UiAlert[] = Array.isArray(data) ? data : (data.data ?? []);
      setAlerts(arr);
      setState("ok");
      setLastUpdated(new Date());
      try { localStorage.setItem("sc:alerts", JSON.stringify(arr)); } catch {}
    } catch (e) {
      if (!silent) { setError(e instanceof Error ? e.message : "Failed to load"); setState("error"); }
    }
  }, []);

  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:alerts");
      if (c) { setAlerts(JSON.parse(c)); setState("ok"); }
    } catch {}
    load(true);
    const iv = setInterval(() => load(true), 60_000);
    return () => clearInterval(iv);
  }, [load]);

  const open     = alerts.filter((a) => !a.resolved_at);
  const resolved = alerts.filter((a) => Boolean(a.resolved_at));
  const critical = alerts.filter((a) => a.severity === "critical");
  const high     = alerts.filter((a) => a.severity === "high" || a.severity === "warning");

  const display = alerts.filter((a) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "open"     && !a.resolved_at) ||
      (filter === "resolved" && Boolean(a.resolved_at));
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      a.message?.toLowerCase().includes(q) ||
      a.type?.toLowerCase().includes(q) ||
      a.siteName?.toLowerCase().includes(q) ||
      a.site_id?.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const showResolved = filter !== "open";
  const colClass = showResolved
    ? "grid-cols-[96px_1fr_160px_130px_130px]"
    : "grid-cols-[96px_1fr_160px_130px]";
  const headers = showResolved
    ? ["Severity", "Alert", "Site", "Detected", "Resolved"]
    : ["Severity", "Alert", "Site", "Detected"];

  return (
    <div>
      <Header
        title="Alerts"
        subtitle="UniFi network alerts across all sites"
        actions={
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-[#999]">
                Updated {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
              </span>
            )}
            <button
              onClick={() => load(false)}
              disabled={state === "loading"}
              className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[13px] font-medium text-[#0a0a0a] px-3 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${state === "loading" ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:items-stretch md:divide-x divide-[#f4f4f4] bg-white border border-[#eaeaea] rounded-xl mb-6 overflow-hidden">
        {[
          { value: state === "ok" ? alerts.length   : "-", label: "Total",    color: undefined },
          { value: state === "ok" ? open.length      : "-", label: "Open",     color: open.length     > 0 ? "#dc2626" : undefined },
          { value: state === "ok" ? critical.length  : "-", label: "Critical", color: critical.length > 0 ? "#dc2626" : undefined },
          { value: state === "ok" ? high.length      : "-", label: "High",     color: high.length     > 0 ? "#d97706" : undefined },
          { value: state === "ok" ? resolved.length  : "-", label: "Resolved", color: resolved.length > 0 ? "#16a34a" : undefined },
        ].map(({ value, label, color }) => (
          <div key={label} className="px-4 py-3 md:flex-1 md:px-5 md:py-4 border-b md:border-b-0 border-[#f4f4f4]">
            <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: color ?? "#0a0a0a" }}>
              {value}
            </p>
            <p className="text-[11px] text-[#999] mt-1 uppercase tracking-wide font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white border border-[#eaeaea] rounded-xl">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#f4f4f4]">
          <div className="flex items-center gap-0.5 bg-[#fafafa] border border-[#eaeaea] rounded-lg p-0.5">
            {(["open", "resolved", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all capitalize ${
                  filter === f
                    ? "bg-white border border-[#eaeaea] text-[#0a0a0a] shadow-sm"
                    : "text-[#888] hover:text-[#0a0a0a]"
                }`}
              >
                {f}
                {state === "ok" && (
                  <span className={`ml-1.5 text-[10px] font-semibold tabular-nums ${filter === f ? "text-[#888]" : "text-[#ccc]"}`}>
                    {f === "open" ? open.length : f === "resolved" ? resolved.length : alerts.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search alerts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-[13px] border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-52 outline-none focus:border-[#0a0a0a] transition-colors bg-white placeholder:text-[#bbb]"
          />
        </div>

        {/* States */}
        {state === "loading" && (
          <div className="py-20 text-center">
            <RefreshCw className="w-4 h-4 animate-spin text-[#ccc] mx-auto mb-3" />
            <p className="text-sm text-[#999]">Loading alerts…</p>
          </div>
        )}
        {state === "unconfigured" && (
          <div className="py-20 text-center">
            <AlertCircle className="w-5 h-5 text-[#f59e0b] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">API key not configured</p>
            <p className="text-xs text-[#999]">
              Add <code className="bg-[#f1f1f1] px-1 rounded">UNIFI_API_KEY</code> to{" "}
              <code className="bg-[#f1f1f1] px-1 rounded">.env.local</code> and restart.
            </p>
          </div>
        )}
        {state === "error" && (
          <div className="py-20 text-center">
            <AlertCircle className="w-5 h-5 text-[#dc2626] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">Failed to load alerts</p>
            <p className="text-xs text-[#999] mb-4">{error}</p>
            <button onClick={() => load(false)} className="text-xs text-[#0070f3] hover:underline font-medium">
              Retry
            </button>
          </div>
        )}
        {state === "ok" && display.length === 0 && (
          <div className="py-20 text-center">
            <CheckCircle className="w-5 h-5 text-[#16a34a] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">
              {filter === "open" ? "No open alerts" : "No alerts found"}
            </p>
            <p className="text-xs text-[#999]">All sites are healthy.</p>
          </div>
        )}

        {state === "ok" && display.length > 0 && (
          <>
            {/* Desktop: column headers (hidden on mobile) */}
            <div className={`hidden md:grid ${colClass} gap-4 px-5 py-2.5 border-b border-[#f4f4f4] bg-[#fafafa]`}>
              {headers.map((h) => (
                <span key={h} className="text-[10px] font-semibold text-[#aaa] uppercase tracking-widest">
                  {h}
                </span>
              ))}
            </div>

            <ul className="divide-y divide-[#f8f8f8]">
              {display.map((alert, i) => {
                const cfg = getSev(alert.severity);
                const isOpen = !alert.resolved_at;
                const type = humanType(alert.type);

                return (
                  <li key={`${alert.id}-${i}`} className="hover:bg-[#fafafa] transition-colors">
                    {/* Mobile card layout */}
                    <div className="md:hidden px-4 py-3">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded border ${cfg.bg} ${cfg.text} ${cfg.border} shrink-0`}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
                          {cfg.label}
                        </span>
                        <span className="text-[11px] text-[#888] tabular-nums font-mono">{formatTime(alert.created_at)}</span>
                      </div>
                      <p className="text-[13px] font-medium text-[#0a0a0a] leading-snug mb-1">
                        {alert.message || type || "Unknown alert"}
                      </p>
                      {alert.site_id && (
                        <Link href={`/sites/${alert.site_id}`} className="text-[12px] text-[#0070f3] hover:underline font-medium flex items-center gap-1 w-fit">
                          <span>{alert.siteName ?? alert.site_id}</span>
                          <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </Link>
                      )}
                    </div>

                    {/* Desktop row layout */}
                    <div className={`hidden md:grid ${colClass} gap-4 px-5 py-3.5 items-start`}>
                      <div>
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.dot }} />
                          {cfg.label}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[#0a0a0a] leading-snug">
                          {alert.message || type || "Unknown alert"}
                        </p>
                        {type && <p className="text-[11px] text-[#aaa] mt-0.5">{type}</p>}
                      </div>
                      <div className="min-w-0 pt-px">
                        {alert.site_id ? (
                          <Link href={`/sites/${alert.site_id}`} className="text-[13px] text-[#0070f3] hover:underline font-medium flex items-center gap-1 w-fit max-w-full">
                            <span className="truncate">{alert.siteName ?? alert.site_id}</span>
                            <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </Link>
                        ) : <span className="text-[13px] text-[#bbb]">-</span>}
                      </div>
                      <span className="text-[12px] text-[#888] tabular-nums font-mono pt-px">{formatTime(alert.created_at)}</span>
                      {showResolved && (
                        <div className="pt-px">
                          {isOpen
                            ? <span className="text-[12px] text-[#bbb]">-</span>
                            : <span className="text-[12px] text-[#888] tabular-nums font-mono">{formatTime(alert.resolved_at)}</span>
                          }
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="px-4 py-3 border-t border-[#f4f4f4]">
              <p className="text-[11px] text-[#bbb]">
                {display.length} alert{display.length !== 1 ? "s" : ""}
                {search && ` matching "${search}"`}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
