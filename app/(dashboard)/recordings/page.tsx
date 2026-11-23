"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import ExportMenu from "@/components/ui/ExportMenu";
import { Mic, Clock, PhoneCall, RefreshCw, AlertCircle, Search } from "lucide-react";
import { formatPhone } from "@/lib/utils";
import { formatLength } from "@/lib/ringlogix-recordings";
import type { CallRecord } from "@/lib/ringlogix-cdr";

/**
 * Recorded calls.
 *
 * This page is shaped the way it is because the API has no way to list a
 * domain's recordings: `recording/read` answers about one call and nothing
 * else. So the server walks recent calls and asks about each, and this
 * shows what came back - which is why it reports how many calls were
 * looked at, and why the window is a few days rather than "everything".
 */

interface RecordingRow {
  call: CallRecord;
  recording: {
    callId: string;
    status: string;
    seconds: number;
    startedAt: string;
    endedAt: string;
    playUrl: string;
  };
}

type ViewState = "loading" | "unconfigured" | "error" | "ok";

const WINDOWS = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 31, label: "31 days" },
];

function when(ms: number) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

/** Who the call was with - the other end, whichever end that is. */
function other(call: CallRecord) {
  const raw = call.direction === "outbound" ? call.toNumber : call.fromNumber;
  const digits = (raw ?? "").replace(/\D/g, "");
  const pretty = digits.length >= 10 ? formatPhone(digits) : raw || "-";
  return { name: call.direction === "outbound" ? "" : call.fromName, number: pretty };
}

const DIRECTION_STYLE: Record<string, string> = {
  inbound:  "bg-[#eff6ff] text-[#0070f3]",
  outbound: "bg-[#f0fdf4] text-[#15803d]",
  internal: "bg-[#f3e8ff] text-[#7c3aed]",
};

export default function RecordingsPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [rows, setRows] = useState<RecordingRow[]>([]);
  const [scanned, setScanned] = useState(0);
  const [asked, setAsked] = useState(0);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [days, setDays] = useState(7);
  // Only one plays at a time. Twenty <audio> elements each streaming a
  // customer's call through our own server is not what anybody meant by
  // clicking play.
  const [playing, setPlaying] = useState<string | null>(null);

  // Bumped to ask again for the same window. The effect below reads it, so
  // Refresh is a state change rather than a second code path.
  const [nonce, setNonce] = useState(0);

  /**
   * Switching the window, or asking again.
   *
   * The "loading" flag is set here, in the handler, rather than at the top
   * of the effect. React's compiler rules out a synchronous setState
   * inside an effect - it cascades renders - and every reload here starts
   * with somebody clicking, so the click is the honest place for it.
   */
  const ask = useCallback((window: number) => {
    setState("loading");
    setPlaying(null);
    setDays(window);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    // Nothing is set before the first await, which is what keeps this off
    // the cascading-render path; `cancelled` drops a reply that lands after
    // the window has already been changed again.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ringlogix/recordings/recent?days=${days}&scan=400`);
        if (cancelled) return;
        if (res.status === 503) { setState("unconfigured"); return; }
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
        setRows(data.items ?? []);
        setScanned(data.callsScanned ?? 0);
        setAsked(data.callsAsked ?? 0);
        setState("ok");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
        setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [days, nonce]);

  const totalSeconds = rows.reduce((s, r) => s + r.recording.seconds, 0);

  const filtered = rows.filter((r) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    const o = other(r.call);
    return (
      o.name.toLowerCase().includes(term) ||
      o.number.toLowerCase().includes(term) ||
      r.call.extension.toLowerCase().includes(term) ||
      r.call.direction.includes(term)
    );
  });

  const exportData = () => ({
    filename: "recordings",
    title: "Call Recordings",
    headers: ["When", "Direction", "With", "Extension", "Length", "Status"],
    rows: filtered.map((r) => {
      const o = other(r.call);
      return [
        when(r.call.startedAt), r.call.direction, o.name ? `${o.name} (${o.number})` : o.number,
        r.call.extension, formatLength(r.recording.seconds), r.recording.status,
      ];
    }),
  });

  return (
    <div>
      <Header
        title="Recordings"
        subtitle="Recorded calls, newest first"
        actions={
          <>
            <ExportMenu data={exportData} disabled={state !== "ok" || filtered.length === 0} />
            <button
              onClick={() => ask(days)}
              disabled={state === "loading"}
              className="flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${state === "loading" ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Mic className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? rows.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Recordings</p>
          <p className="text-xs text-[#999]">In the last {days === 1 ? "24 hours" : `${days} days`}</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Clock className="w-4 h-4 text-[#17c964]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? formatLength(totalSeconds) : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Audio</p>
          <p className="text-xs text-[#999]">Across every recording below</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <PhoneCall className="w-4 h-4 text-[#7c3aed]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? scanned : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Calls Looked At</p>
          <p className="text-xs text-[#999]">
            {state === "ok" ? `${asked} could have had audio` : "-"}
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <div className="flex items-center gap-1 bg-[#fafafa] border border-[#eaeaea] rounded-lg p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w.days}
                onClick={() => ask(w.days)}
                disabled={state === "loading"}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 ${
                  days === w.days ? "bg-white text-[#0a0a0a] border border-[#eaeaea]" : "text-[#666] hover:text-[#0a0a0a]"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-[#999] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search name, number or extension…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm border border-[#eaeaea] rounded-lg pl-8 pr-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors bg-white text-[#0a0a0a]"
            />
          </div>
        </div>

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Looking through recent calls…</p>
            <p className="text-xs text-[#999] mt-1">
              Each call has to be asked about separately, so this takes a moment.
            </p>
          </div>
        )}

        {state === "unconfigured" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f5a524] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">RingLogix isn&apos;t configured</p>
            <p className="text-xs text-[#999]">
              Set <code className="bg-[#f1f1f1] px-1 rounded">RINGLOGIX_API_ID</code> and the rest in the
              environment, then restart.
            </p>
          </div>
        )}

        {state === "error" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f31260] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">Couldn&apos;t load recordings</p>
            <p className="text-xs text-[#999] mb-4">{error}</p>
            <button onClick={() => ask(days)} className="text-xs text-[#0070f3] hover:underline">Retry</button>
          </div>
        )}

        {state === "ok" && rows.length === 0 && (
          <div className="p-12 text-center">
            <Mic className="w-6 h-6 text-[#999] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">No recorded calls in this window</p>
            {/* Said with the numbers, because a bare "no recordings" reads
                as a broken page when it usually means recording is off for
                the extensions that were busy. */}
            <p className="text-xs text-[#999]">
              {asked} of {scanned} calls could have had audio, and none of them did.
            </p>
          </div>
        )}

        {state === "ok" && rows.length > 0 && filtered.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-sm text-[#999]">Nothing matches that search.</p>
          </div>
        )}

        {state === "ok" && filtered.length > 0 && (
          <div className="divide-y divide-[#f4f4f4]">
            {filtered.map((r) => {
              const o = other(r.call);
              const key = `${r.recording.startedAt}|${r.recording.seconds}`;
              const isOpen = playing === key;
              return (
                <div key={key} className="px-5 py-3.5 hover:bg-[#fafafa] transition-colors">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md shrink-0 ${
                        DIRECTION_STYLE[r.call.direction] ?? "bg-[#f5f5f5] text-[#666]"
                      }`}
                    >
                      {r.call.direction}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#0a0a0a] truncate">{o.name || o.number}</p>
                      <p className="text-xs text-[#999] truncate">
                        {o.name ? `${o.number} · ` : ""}
                        {when(r.call.startedAt)}
                        {r.call.extension ? ` · ext ${r.call.extension}` : ""}
                      </p>
                    </div>

                    <span className="text-sm font-mono text-[#666] shrink-0 tabular-nums">
                      {formatLength(r.recording.seconds)}
                    </span>

                    {/* "archived" plays as readily as "converted" - it says
                        where the file lives, not whether it is ready. */}
                    <span className="text-[10px] text-[#999] uppercase tracking-wider shrink-0 w-16 text-right">
                      {r.recording.status}
                    </span>

                    <button
                      onClick={() => setPlaying(isOpen ? null : key)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${
                        isOpen
                          ? "bg-[#f5f5f5] border-[#eaeaea] text-[#0a0a0a]"
                          : "bg-white border-[#eaeaea] text-[#0a0a0a] hover:bg-[#fafafa]"
                      }`}
                    >
                      {isOpen ? "Close" : "Play"}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-3">
                      {/* Streamed through our own route, not from RingLogix
                          directly: their address carries an auth token and
                          expires. */}
                      <audio src={r.recording.playUrl} controls autoPlay preload="none" className="w-full h-9" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
