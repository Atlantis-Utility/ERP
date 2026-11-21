"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import ExportMenu from "@/components/ui/ExportMenu";
import { PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed, ArrowLeftRight, Voicemail, RefreshCw, AlertCircle } from "lucide-react";
import { formatPhone } from "@/lib/utils";
import {
  normalizeCdrs, formatDuration, counterparty,
  type CallRecord, type CallDirection, type RawCdr,
} from "@/lib/ringlogix-cdr";

type ViewState = "loading" | "unconfigured" | "denied" | "error" | "ok";
type Filter = "all" | CallDirection | "missed";

interface PortalCustomer { id: string; company: string }

function formatTime(ms: number) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

/**
 * What became of the call, in one word.
 *
 * "Missed" is the one worth looking for, so it is the only one coloured:
 * a list where every row shouts is a list nobody scans.
 */
function Outcome({ call }: { call: CallRecord }) {
  if (call.voicemail) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7e6] px-2 py-0.5 text-[10px] font-medium text-[#92400e]">
        <Voicemail className="w-3 h-3" /> Voicemail
      </span>
    );
  }
  if (call.missed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#fef2f2] px-2 py-0.5 text-[10px] font-medium text-[#b91c1c]">
        <PhoneMissed className="w-3 h-3" /> Missed
      </span>
    );
  }
  return <span className="text-[11px] text-[#999]">Answered</span>;
}

function DirectionChip({ direction }: { direction: CallDirection }) {
  if (direction === "inbound") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#f0fdf4] px-2 py-0.5 text-[10px] font-medium text-[#15803d]">
        <PhoneIncoming className="w-3 h-3" /> In
      </span>
    );
  }
  if (direction === "outbound") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#eff6ff] px-2 py-0.5 text-[10px] font-medium text-[#0070f3]">
        <PhoneOutgoing className="w-3 h-3" /> Out
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[10px] font-medium text-[#666]">
      <ArrowLeftRight className="w-3 h-3" /> Internal
    </span>
  );
}

function Kpi({ icon, value, label, hint, tone }: {
  icon: React.ReactNode; value: string | number; label: string; hint: string; tone?: string;
}) {
  return (
    <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
      <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">{icon}</div>
      <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">{value}</p>
      <p className="text-sm text-[#666] mb-1">{label}</p>
      <p className={`text-xs ${tone ?? "text-[#999]"}`}>{hint}</p>
    </div>
  );
}

export default function CallRecordsPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async (silent = false) => {
    if (!silent) setState("loading");
    try {
      const res = await fetch("/api/ringlogix/cdr?limit=300");
      if (res.status === 503) { setState("unconfigured"); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        // A refusal is not a failure to retry: it answers the same way
        // until somebody changes the API user's scope.
        if (res.status === 403) { setError(d.message ?? "RingLogix won't let us read call records."); setState("denied"); return; }
        throw new Error(d.error ?? `Request failed (${res.status})`);
      }
      const data = await res.json();
      const rows: RawCdr[] = Array.isArray(data) ? data : (data.data ?? []);
      setCalls(normalizeCdrs(rows));
      setState("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setState("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Calls carry the domain id; nobody thinks in domain ids.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/ringlogix/customers");
        if (!res.ok) return;
        const data = await res.json();
        const list: PortalCustomer[] = Array.isArray(data) ? data : (data.data ?? []);
        if (alive) setNames(Object.fromEntries(list.map((c) => [c.id, c.company])));
      } catch { /* the domain id is a usable fallback */ }
    })();
    return () => { alive = false; };
  }, []);

  const counts = useMemo(() => ({
    all: calls.length,
    inbound: calls.filter((c) => c.direction === "inbound").length,
    outbound: calls.filter((c) => c.direction === "outbound").length,
    internal: calls.filter((c) => c.direction === "internal").length,
    missed: calls.filter((c) => c.missed).length,
  }), [calls]);

  const talkMinutes = useMemo(
    () => Math.round(calls.reduce((n, c) => n + c.talkSec, 0) / 60),
    [calls],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return calls.filter((c) => {
      if (filter === "missed" && !c.missed) return false;
      if (filter !== "all" && filter !== "missed" && c.direction !== filter) return false;
      if (!q) return true;
      const company = names[c.domain] ?? "";
      return (
        c.fromNumber.includes(q) || c.toNumber.includes(q) ||
        c.fromName.toLowerCase().includes(q) ||
        company.toLowerCase().includes(q) ||
        c.extension.toLowerCase().includes(q)
      );
    });
  }, [calls, filter, search, names]);

  const exportData = () => ({
    filename: "calls",
    title: "Calls",
    headers: ["Time", "Direction", "Number", "Caller ID", "Customer", "Extension", "Duration", "Outcome"],
    rows: filtered.map((c) => {
      const other = counterparty(c);
      return [
        formatTime(c.startedAt), c.direction, formatPhone(other.number) || other.number,
        other.name, names[c.domain] ?? c.domain, c.extension,
        formatDuration(c.talkSec || c.durationSec),
        c.voicemail ? "Voicemail" : c.missed ? "Missed" : "Answered",
      ];
    }),
  });

  const FILTERS: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "All", n: counts.all },
    { key: "inbound", label: "Inbound", n: counts.inbound },
    { key: "outbound", label: "Outbound", n: counts.outbound },
    { key: "internal", label: "Internal", n: counts.internal },
    { key: "missed", label: "Missed", n: counts.missed },
  ];

  return (
    <div>
      <Header
        title="Calls"
        subtitle="Every call through the phone system, newest first"
        actions={
          <>
            <ExportMenu data={exportData} disabled={state !== "ok" || filtered.length === 0} />
            <button
              onClick={() => load()}
              disabled={state === "loading"}
              data-tip="Fetch the latest calls from RingLogix"
              className="flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${state === "loading" ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Kpi
          icon={<PhoneCall className="w-4 h-4 text-[#0070f3]" />}
          value={state === "ok" ? counts.all : "-"}
          label="Calls" hint={state === "ok" ? `${talkMinutes} minutes of talk time` : "-"}
        />
        <Kpi
          icon={<PhoneIncoming className="w-4 h-4 text-[#17c964]" />}
          value={state === "ok" ? counts.inbound : "-"}
          label="Inbound" hint="Customers ringing us"
        />
        <Kpi
          icon={<PhoneOutgoing className="w-4 h-4 text-[#7c3aed]" />}
          value={state === "ok" ? counts.outbound : "-"}
          label="Outbound" hint="Calls we placed"
        />
        <Kpi
          icon={<PhoneMissed className="w-4 h-4 text-[#f31260]" />}
          value={state === "ok" ? counts.missed : "-"}
          label="Missed" hint={counts.missed > 0 ? "Nobody picked up, no voicemail" : "Nothing went unanswered"}
          tone={counts.missed > 0 ? "text-[#b91c1c]" : undefined}
        />
      </div>

      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[#eaeaea]">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f.key
                    ? "bg-[#0a0a0a] text-white"
                    : "bg-[#fafafa] text-[#666] hover:bg-[#f0f0f0]"
                }`}
              >
                {f.label}
                <span className={filter === f.key ? "ml-1.5 opacity-60" : "ml-1.5 text-[#999]"}>{f.n}</span>
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search a number, name, customer or extension…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-72 outline-none focus:border-[#0070f3] transition-colors"
          />
        </div>

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Loading calls…</p>
          </div>
        )}

        {state === "unconfigured" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f5a524] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">RingLogix isn&apos;t configured</p>
            <p className="text-xs text-[#999]">The API credentials are missing from this environment.</p>
          </div>
        )}

        {state === "denied" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f5a524] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">RingLogix won&apos;t let us read this</p>
            <p className="text-xs text-[#999] max-w-md mx-auto">{error}</p>
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
            <p className="text-sm text-[#999]">
              {calls.length === 0 ? "No calls yet." : "No calls match that."}
            </p>
          </div>
        )}

        {state === "ok" && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160">
              <thead>
                <tr className="border-b border-[#eaeaea]">
                  {["Time", "", "Who", "Customer", "Ext", "Duration", "Outcome"].map((h, i) => (
                    <th key={i} className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const other = counterparty(c);
                  return (
                    <tr key={c.id} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                      <td className="px-5 py-3 text-xs text-[#666] whitespace-nowrap">{formatTime(c.startedAt)}</td>
                      <td className="px-5 py-3"><DirectionChip direction={c.direction} /></td>
                      <td className="px-5 py-3">
                        <p className="text-sm font-mono text-[#0a0a0a]">
                          {formatPhone(other.number) || other.number || "-"}
                        </p>
                        {other.name && <p className="text-[10px] text-[#999]">{other.name}</p>}
                      </td>
                      <td className="px-5 py-3 text-sm text-[#666]">{names[c.domain] ?? c.domain ?? "-"}</td>
                      <td className="px-5 py-3 text-sm text-[#666]">{c.extension || "-"}</td>
                      <td className="px-5 py-3 text-sm text-[#666] whitespace-nowrap">
                        {formatDuration(c.talkSec || c.durationSec)}
                      </td>
                      <td className="px-5 py-3"><Outcome call={c} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
