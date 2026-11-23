"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import ExportMenu from "@/components/ui/ExportMenu";
import { Voicemail as VoicemailIcon, Clock, Inbox, RefreshCw, AlertCircle, Search, Forward } from "lucide-react";
import { formatPhone } from "@/lib/utils";
import { formatLength } from "@/lib/ringlogix-recordings";

/**
 * Voicemail, ours and our customers'.
 *
 * Voicemail has no object of its own on this API - it falls out of the UC
 * Inbox, one extension at a time - so the server walks a domain's staff
 * mailboxes and collects what it finds. That is why this is per customer
 * rather than one big list, and why it takes a second to load.
 */

interface VoicemailRow {
  id: string;
  mailbox: string;
  mailboxName: string;
  fromName: string;
  fromNumber: string;
  seconds: number;
  recordedAt: string;
  timeZone: string;
  bytesLabel: string;
  transcription: string;
  forwarded: boolean;
  playUrl: string;
}

interface CustomerOption {
  id: string;
  company: string;
}

type ViewState = "loading" | "unconfigured" | "error" | "ok";

/** The PBX gives "2026-11-13 20:41:12" in the mailbox's own timezone. */
function prettyWhen(stamp: string) {
  if (!stamp) return "-";
  const [date, time] = stamp.split(" ");
  const d = new Date(`${date}T${time ?? "00:00:00"}`);
  if (Number.isNaN(d.getTime())) return stamp;
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

/** A caller is an extension, a phone number, or a name the carrier sent. */
function caller(v: VoicemailRow) {
  const digits = (v.fromNumber ?? "").replace(/\D/g, "");
  const number = digits.length >= 10 ? formatPhone(digits) : v.fromNumber || "";
  return { name: v.fromName, number };
}

export default function VoicemailPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [rows, setRows] = useState<VoicemailRow[]>([]);
  const [asked, setAsked] = useState(0);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Set in the handler rather than the effect: React's compiler rules out a
  // synchronous setState inside an effect, and every reload starts with a
  // click on the selector or on Refresh.
  const ask = useCallback((next: string) => {
    setState("loading");
    setPlaying(null);
    setDomain(next);
    setNonce((n) => n + 1);
  }, []);

  // The customer list, so a domain can be picked by name rather than by id.
  // Failing is not fatal - our own domain still loads.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ringlogix/customers");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setCustomers(
          (Array.isArray(data) ? data : [])
            .map((c: { id?: string; company?: string }) => ({ id: String(c.id ?? ""), company: String(c.company ?? "") }))
            .filter((c: CustomerOption) => c.id)
            .sort((a: CustomerOption, b: CustomerOption) => a.company.localeCompare(b.company)),
        );
      } catch {
        // no selector, our own domain only
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = domain ? `?domain=${encodeURIComponent(domain)}` : "";
        const res = await fetch(`/api/ringlogix/voicemail${qs}`);
        if (cancelled) return;
        if (res.status === 503) { setState("unconfigured"); return; }
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
        setRows(data.voicemails ?? []);
        setAsked(data.mailboxesAsked ?? 0);
        setState("ok");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
        setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [domain, nonce]);

  const totalSeconds = rows.reduce((s, r) => s + r.seconds, 0);
  const mailboxCount = new Set(rows.map((r) => r.mailbox)).size;

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const c = caller(r);
    return (
      c.name.toLowerCase().includes(q) ||
      c.number.toLowerCase().includes(q) ||
      r.mailbox.toLowerCase().includes(q) ||
      r.mailboxName.toLowerCase().includes(q) ||
      r.transcription.toLowerCase().includes(q)
    );
  });

  const exportData = () => ({
    filename: "voicemail",
    title: "Voicemail",
    headers: ["Recorded", "Mailbox", "From", "Length", "Size", "Transcription"],
    rows: filtered.map((r) => {
      const c = caller(r);
      return [
        r.recordedAt, r.mailboxName ? `${r.mailboxName} (${r.mailbox})` : r.mailbox,
        c.name ? `${c.name} ${c.number}`.trim() : c.number,
        formatLength(r.seconds), r.bytesLabel, r.transcription,
      ];
    }),
  });

  return (
    <div>
      <Header
        title="Voicemail"
        subtitle="Messages left on our mailboxes and our customers'"
        actions={
          <>
            <ExportMenu data={exportData} disabled={state !== "ok" || filtered.length === 0} />
            <button
              onClick={() => ask(domain)}
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
            <VoicemailIcon className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? rows.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Messages</p>
          <p className="text-xs text-[#999]">Everything still in the mailboxes</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Clock className="w-4 h-4 text-[#17c964]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? formatLength(totalSeconds) : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Audio</p>
          <p className="text-xs text-[#999]">Across every message</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Inbox className="w-4 h-4 text-[#7c3aed]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? mailboxCount : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Mailboxes With Messages</p>
          <p className="text-xs text-[#999]">{state === "ok" ? `${asked} asked` : "-"}</p>
        </div>
      </div>

      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <select
            value={domain}
            onChange={(e) => ask(e.target.value)}
            disabled={state === "loading"}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors bg-white text-[#0a0a0a] max-w-64 disabled:opacity-50"
          >
            <option value="">Atlantis Utility (ours)</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.company || c.id}</option>
            ))}
          </select>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-[#999] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search caller, mailbox or transcript…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm border border-[#eaeaea] rounded-lg pl-8 pr-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors bg-white text-[#0a0a0a]"
            />
          </div>
        </div>

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Checking each mailbox…</p>
            <p className="text-xs text-[#999] mt-1">
              Voicemail is read one extension at a time, so this takes a moment.
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
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">Couldn&apos;t load voicemail</p>
            <p className="text-xs text-[#999] mb-4">{error}</p>
            <button onClick={() => ask(domain)} className="text-xs text-[#0070f3] hover:underline">Retry</button>
          </div>
        )}

        {state === "ok" && rows.length === 0 && (
          <div className="p-12 text-center">
            <VoicemailIcon className="w-6 h-6 text-[#999] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">No voicemail in these mailboxes</p>
            <p className="text-xs text-[#999]">
              {asked} staff {asked === 1 ? "mailbox was" : "mailboxes were"} checked. Queues, auto attendants
              and routing entries are skipped — they have no mailbox.
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
            {filtered.map((v) => {
              const c = caller(v);
              const isOpen = playing === v.id;
              return (
                <div key={v.id} className="px-5 py-3.5 hover:bg-[#fafafa] transition-colors">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#0a0a0a] truncate">
                        {c.name || c.number || "Unknown caller"}
                        {v.forwarded && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-[#92400e] bg-[#fff7e6] px-1.5 py-0.5 rounded">
                            <Forward className="w-2.5 h-2.5" />
                            forwarded
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-[#999] truncate">
                        {c.name && c.number ? `${c.number} · ` : ""}
                        to {v.mailboxName || `ext ${v.mailbox}`} · {prettyWhen(v.recordedAt)}
                      </p>
                    </div>

                    <span className="text-sm font-mono text-[#666] shrink-0 tabular-nums">
                      {formatLength(v.seconds)}
                    </span>
                    <span className="text-[10px] text-[#999] shrink-0 w-20 text-right">{v.bytesLabel}</span>

                    <button
                      onClick={() => setPlaying(isOpen ? null : v.id)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${
                        isOpen
                          ? "bg-[#f5f5f5] border-[#eaeaea] text-[#0a0a0a]"
                          : "bg-white border-[#eaeaea] text-[#0a0a0a] hover:bg-[#fafafa]"
                      }`}
                    >
                      {isOpen ? "Close" : "Play"}
                    </button>
                  </div>

                  {/* Only shown where it exists - the field is always there,
                      and is empty unless transcription is switched on for
                      that mailbox. */}
                  {v.transcription && (
                    <p className="mt-2 text-xs text-[#666] leading-relaxed bg-[#fafafa] border border-[#eaeaea] rounded-lg px-3 py-2">
                      {v.transcription}
                    </p>
                  )}

                  {isOpen && (
                    <div className="mt-3">
                      <audio src={v.playUrl} controls autoPlay preload="none" className="w-full h-9" />
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
