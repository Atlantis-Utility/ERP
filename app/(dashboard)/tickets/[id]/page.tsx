"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, Mail, User, Calendar, RefreshCw, ExternalLink } from "lucide-react";
import Header from "@/components/layout/Header";
import { upsertTicket, subscribeAllTicketMeta } from "@/lib/db/tickets";
import type { TicketStatus, TicketPriority, TicketMeta } from "@/lib/db/tickets";
import { subscribeEmployees } from "@/lib/db/employees";
import { logActivity } from "@/lib/activity-log";
import type { Employee } from "@/lib/mock-data";
import Link from "next/link";

interface FullEmail {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  receivedAt: string;
  snippet: string;
  isUnread: boolean;
  html: string | null;
  text: string | null;
  messages?: FullEmail[];
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; bg: string; text: string }> = {
  "open":        { label: "Open",        bg: "bg-[#fef2f2]", text: "text-[#b91c1c]" },
  "in-progress": { label: "In Progress", bg: "bg-[#eff6ff]", text: "text-[#1d4ed8]" },
  "resolved":    { label: "Resolved",    bg: "bg-[#f0fdf4]", text: "text-[#16a34a]" },
  "closed":      { label: "Closed",      bg: "bg-[#f5f5f5]", text: "text-[#666]"    },
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; bg: string; text: string }> = {
  "urgent": { label: "Urgent", bg: "bg-[#fef2f2]", text: "text-[#b91c1c]" },
  "high":   { label: "High",   bg: "bg-[#fff7ed]", text: "text-[#c2410c]" },
  "medium": { label: "Medium", bg: "bg-[#fefce8]", text: "text-[#854d0e]" },
  "low":    { label: "Low",    bg: "bg-[#f0fdf4]", text: "text-[#166534]" },
};

const ALL_STATUSES: TicketStatus[] = ["open", "in-progress", "resolved", "closed"];
const ALL_PRIORITIES: TicketPriority[] = ["urgent", "high", "medium", "low"];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch {
    return iso;
  }
}

function EmailBody({ html, text }: { html: string | null; text: string | null }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;
    const onLoad = () => {
      try {
        const body = iframe.contentDocument?.body;
        if (body) setHeight(Math.max(300, body.scrollHeight + 32));
      } catch { /* cross-origin guard */ }
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [html]);

  if (html) {
    return (
      <iframe
        ref={iframeRef}
        srcDoc={html}
        sandbox="allow-same-origin"
        style={{ height }}
        className="w-full border-0 rounded-b-xl"
        title="Email body"
      />
    );
  }

  if (text) {
    return (
      <pre className="whitespace-pre-wrap font-sans text-sm text-[#333] leading-relaxed p-6">
        {text}
      </pre>
    );
  }

  return (
    <p className="p-6 text-sm text-[#999] italic">No message body available.</p>
  );
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [email, setEmail]         = useState<FullEmail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [metaMap, setMetaMap]     = useState<Record<string, TicketMeta>>({});
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  const meta = metaMap[id];

  const [status, setStatus]         = useState<TicketStatus>("open");
  const [priority, setPriority]     = useState<TicketPriority>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [notes, setNotes]           = useState("");

  useEffect(() => {
    if (meta) {
      setStatus(meta.status);
      setPriority(meta.priority);
      setAssigneeId(meta.assigneeId ?? "");
      setNotes(meta.notes ?? "");
    }
  }, [meta?.status, meta?.priority, meta?.assigneeId, meta?.notes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true);
    fetch(`/api/tickets/${id}`)
      .then((r) => r.json())
      .then((data: FullEmail & { error?: string }) => {
        if (data.error) {
          setEmailError(data.error === "not_configured" ? "Gmail credentials not configured." : data.error);
        } else {
          setEmail(data);
        }
      })
      .catch((err) => setEmailError(err instanceof Error ? err.message : "Failed to load email"))
      .finally(() => setLoading(false));

    const unsubMeta = subscribeAllTicketMeta((metas) => {
      const map: Record<string, TicketMeta> = {};
      metas.forEach((m) => { map[m.id] = m; });
      setMetaMap(map);
    });
    const unsubEmp = subscribeEmployees(setEmployees);
    return () => { unsubMeta(); unsubEmp(); };
  }, [id]);

  async function handleSave() {
    setSaving(true);
    const assignee = employees.find((e) => e.id === assigneeId);
    const patch: Partial<Omit<TicketMeta, "id">> = {
      status,
      priority,
      assigneeId: assigneeId || undefined,
      assigneeName: assignee?.name,
      notes: notes || undefined,
    };
    await upsertTicket(id, patch);
    logActivity({
      category: "access",
      action: "Ticket updated",
      detail: `Ticket "${email?.subject ?? id}" — status: ${status}, assignee: ${assignee?.name ?? "unassigned"}`,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const selectClass =
    "w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:outline-none focus:border-[#0070f3] transition-colors appearance-none";

  if (loading) {
    return (
      <div>
        <Header title="Ticket" subtitle="Loading…" />
        <div className="flex items-center justify-center py-32 text-sm text-[#999]">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
          Loading ticket…
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title={email?.subject ?? "Ticket"}
        subtitle={email ? `From ${email.fromName || email.from}` : ""}
        actions={
          <Link
            href="/tickets"
            className="flex items-center gap-2 border border-[#eaeaea] text-sm font-medium text-[#444] px-3 py-2 rounded-lg hover:bg-[#fafafa] hover:text-[#0a0a0a] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Tickets
          </Link>
        }
      />

      {emailError && (
        <div className="mb-6 bg-[#fef2f2] border border-[#fecaca] rounded-xl p-5">
          <p className="text-sm font-semibold text-[#b91c1c] mb-1">Failed to load email</p>
          <p className="text-sm text-[#991b1b] font-mono">{emailError}</p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Thread conversation */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Subject header */}
          <div className="bg-white border border-[#eaeaea] rounded-xl px-6 py-4">
            <h1 className="text-lg font-semibold text-[#0a0a0a] leading-snug">
              {email?.subject ?? id}
            </h1>
            <p className="text-xs text-[#999] mt-1">
              {(email?.messages?.length ?? 1)} message{(email?.messages?.length ?? 1) !== 1 ? "s" : ""} in thread
            </p>
          </div>

          {/* Each message in the thread */}
          {(email?.messages ?? (email ? [email] : [])).map((msg, idx) => (
            <div key={msg.id} className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
              {/* Message header */}
              <div className="px-6 py-4 border-b border-[#f4f4f4]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#f0f0f0] flex items-center justify-center shrink-0 text-xs font-semibold text-[#666]">
                      {(msg.fromName || msg.from).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0a0a0a] truncate">
                        {msg.fromName && msg.fromName !== msg.from ? msg.fromName : msg.from}
                      </p>
                      <p className="text-xs text-[#999] truncate">{msg.from}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {msg.isUnread && (
                      <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#eff6ff] text-[#1d4ed8]">
                        NEW
                      </span>
                    )}
                    {idx === 0 && (
                      <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#f5f5f5] text-[#666]">
                        Original
                      </span>
                    )}
                    <span className="text-xs text-[#999]">{formatDate(msg.receivedAt)}</span>
                  </div>
                </div>

                <div className="mt-2.5 ml-10.5 space-y-1 pl-10.5">
                  {msg.to && (
                    <p className="text-xs text-[#999]">
                      <span className="font-medium">To:</span> {msg.to}
                    </p>
                  )}
                  {msg.cc && (
                    <p className="text-xs text-[#999]">
                      <span className="font-medium">CC:</span> {msg.cc}
                    </p>
                  )}
                </div>
              </div>

              {/* Message body */}
              <div className="overflow-hidden">
                <EmailBody html={msg.html} text={msg.text} />
              </div>
            </div>
          ))}

          {!email && !emailError && (
            <p className="p-6 text-sm text-[#999] italic text-center">No content available.</p>
          )}
        </div>

        {/* Metadata panel */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="bg-white border border-[#eaeaea] rounded-xl p-5 space-y-4 sticky top-4">
            <h3 className="text-sm font-semibold text-[#0a0a0a]">Ticket Details</h3>

            {/* Status + Priority badges (read view) */}
            {meta && (
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_CONFIG[meta.status].bg} ${STATUS_CONFIG[meta.status].text}`}>
                  {STATUS_CONFIG[meta.status].label}
                </span>
                <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${PRIORITY_CONFIG[meta.priority].bg} ${PRIORITY_CONFIG[meta.priority].text}`}>
                  {PRIORITY_CONFIG[meta.priority].label}
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#444] mb-1.5">Status</label>
              <div className="relative">
                <select value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)} className={selectClass}>
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#999] pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#444] mb-1.5">Priority</label>
              <div className="relative">
                <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className={selectClass}>
                  {ALL_PRIORITIES.map((p) => (
                    <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#999] pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#444] mb-1.5">Assignee</label>
              <div className="relative">
                <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={selectClass}>
                  <option value="">Unassigned</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#999] pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#444] mb-1.5">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Add internal notes…"
                className="w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#bbb] focus:outline-none focus:border-[#0070f3] transition-colors resize-none"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className={`w-full text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50 ${
                saved
                  ? "bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0]"
                  : "bg-[#0a0a0a] text-white hover:bg-[#333]"
              }`}
            >
              {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
            </button>

            {meta?.updatedAt && (
              <p className="text-[10px] text-[#bbb] text-center">
                Last updated {formatDate(meta.updatedAt)}
              </p>
            )}

            <div className="border-t border-[#f4f4f4] pt-4">
              <p className="text-[10px] font-medium text-[#999] uppercase tracking-wide mb-2">Message Info</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[#999]">Message ID</span>
                  <span className="text-[#666] font-mono truncate max-w-[100px]">{id.slice(0, 12)}…</span>
                </div>
                {email?.threadId && (
                  <div className="flex justify-between text-xs">
                    <span className="text-[#999]">Thread ID</span>
                    <span className="text-[#666] font-mono truncate max-w-[100px]">{email.threadId.slice(0, 12)}…</span>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => router.push("/tickets")}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-[#666] hover:text-[#0a0a0a] transition-colors py-1"
            >
              <ExternalLink className="w-3 h-3" />
              View all tickets
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
