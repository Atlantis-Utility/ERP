"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, RefreshCw, TicketCheck, X, Plus, Mail, Phone, Globe, Pencil } from "lucide-react";
import Header from "@/components/layout/Header";
import Select from "@/components/ui/Select";
import { subscribeEmployees } from "@/lib/db/employees";
import { upsertTicket, subscribeAllTicketMeta, createManualTicket, upsertManualTicket, subscribeManualTickets } from "@/lib/db/tickets";
import type { TicketStatus, TicketPriority, TicketMeta, ManualTicket, TicketSource } from "@/lib/db/tickets";
import { logActivity } from "@/lib/activity-log";
import { isTicketUnread, markLegacyTicketNotificationsRead } from "@/lib/notifications";
import type { Employee } from "@/lib/mock-data";

interface EmailTicket {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  isUnread: boolean;
}

// Unified display type covering both email and manual tickets
interface UnifiedTicket {
  id: string;
  source: TicketSource;
  subject: string;
  fromName: string;
  from: string;
  snippet: string;
  receivedAt: string;
  isUnread: boolean;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId?: string;
  assigneeName?: string;
  notes?: string;
  // email-only
  threadId?: string;
  // manual-only
  ticketNumber?: number;
  description?: string;
}

const SOURCE_CONFIG: Record<TicketSource, { label: string; icon: React.ReactNode; color: string }> = {
  email:  { label: "Email",    icon: <Mail   className="w-3 h-3" />, color: "text-[#1d4ed8] bg-[#eff6ff]" },
  phone:  { label: "Phone",    icon: <Phone  className="w-3 h-3" />, color: "text-[#b45309] bg-[#fffbeb]" },
  web:    { label: "Web",      icon: <Globe  className="w-3 h-3" />, color: "text-[#16a34a] bg-[#f0fdf4]" },
  manual: { label: "Manual",   icon: <Pencil className="w-3 h-3" />, color: "text-[#666]   bg-[#f5f5f5]"  },
};

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

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── New Ticket Drawer ────────────────────────────────────────────────────────

interface NewTicketDrawerProps {
  employees: Employee[];
  onSave: (data: Omit<ManualTicket, "id" | "ticketNumber" | "createdAt" | "updatedAt">) => Promise<void>;
  onClose: () => void;
}

function NewTicketDrawer({ employees, onSave, onClose }: NewTicketDrawerProps) {
  const [source, setSource]           = useState<TicketSource>("phone");
  const [subject, setSubject]         = useState("");
  const [description, setDescription] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [status, setStatus]           = useState<TicketStatus>("open");
  const [priority, setPriority]       = useState<TicketPriority>("medium");
  const [assigneeId, setAssigneeId]   = useState("");
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    if (!subject.trim() || !customerName.trim()) return;
    setSaving(true);
    const assignee = employees.find((e) => e.id === assigneeId);
    await onSave({
      source, subject: subject.trim(), description: description.trim(),
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      status, priority,
      assigneeId: assigneeId || undefined,
      assigneeName: assignee?.name,
    });
    setSaving(false);
    onClose();
  }

  const inputClass = "w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#bbb] focus:outline-none focus:border-[#0070f3] transition-colors";

  return (
    <div className="fixed inset-0 z-150 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-[#eaeaea] shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[#0a0a0a]">New Ticket</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#f5f5f5] text-[#999] transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {/* Source selector */}
        <div className="flex gap-2 mb-5">
          {(["phone", "web", "manual"] as TicketSource[]).map((s) => {
            const cfg = SOURCE_CONFIG[s];
            return (
              <button key={s} onClick={() => setSource(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${source === s ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "bg-white text-[#666] border-[#eaeaea] hover:border-[#ccc]"}`}>
                {cfg.icon} {cfg.label}
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#444] mb-1.5">Subject <span className="text-red-500">*</span></label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief description of the issue" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#444] mb-1.5">Customer Name <span className="text-red-500">*</span></label>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Full name" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#444] mb-1.5">Email</label>
              <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="customer@email.com" type="email" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#444] mb-1.5">Phone</label>
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(805) 555-0100" type="tel" className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#444] mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Detailed description…" className={inputClass + " resize-none"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#444] mb-1.5">Priority</label>
              <Select
                value={priority}
                onChange={(v) => setPriority(v as TicketPriority)}
                options={(["urgent","high","medium","low"] as TicketPriority[]).map((p) => ({ value: p, label: PRIORITY_CONFIG[p].label }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#444] mb-1.5">Assignee</label>
              <Select
                value={assigneeId}
                onChange={setAssigneeId}
                options={[
                  { value: "", label: "Unassigned" },
                  ...employees.map((emp) => ({ value: emp.id, label: emp.name })),
                ]}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#444] mb-1.5">Status</label>
            <Select
              value={status}
              onChange={(v) => setStatus(v as TicketStatus)}
              options={(["open","in-progress","resolved","closed"] as TicketStatus[]).map((s) => ({ value: s, label: STATUS_CONFIG[s].label }))}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} disabled={saving} className="flex-1 border border-[#eaeaea] bg-white text-sm font-medium text-[#444] py-2.5 rounded-xl hover:bg-[#fafafa] transition-colors disabled:opacity-50">Cancel</button>
          <button onClick={handleSave} disabled={saving || !subject.trim() || !customerName.trim()} className="flex-1 bg-[#0a0a0a] text-white text-sm font-medium py-2.5 rounded-xl hover:bg-[#333] transition-colors disabled:opacity-50">
            {saving ? "Creating…" : "Create Ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AssignModalProps {
  ticket: UnifiedTicket;
  employees: Employee[];
  onSave: (patch: Partial<TicketMeta>) => Promise<void>;
  onClose: () => void;
}

function AssignModal({ ticket, employees, onSave, onClose }: AssignModalProps) {
  const [status, setStatus]     = useState<TicketStatus>(ticket.status);
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority);
  const [assigneeId, setAssigneeId] = useState(ticket.assigneeId ?? "");
  const [notes, setNotes]       = useState(ticket.notes ?? "");
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    setSaving(true);
    const assignee = employees.find((e) => e.id === assigneeId);
    await onSave({
      status,
      priority,
      assigneeId: assigneeId || undefined,
      assigneeName: assignee?.name,
      notes: notes || undefined,
    });
    setSaving(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-150 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-[#eaeaea] shadow-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="text-base font-semibold text-[#0a0a0a] leading-snug truncate">
              {ticket.subject}
            </h2>
            <p className="text-xs text-[#999] mt-0.5 truncate">{ticket.from}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#f5f5f5] text-[#999] hover:text-[#0a0a0a] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#444] mb-1.5">Status</label>
            <Select
              value={status}
              onChange={(v) => setStatus(v as TicketStatus)}
              options={ALL_STATUSES.map((s) => ({ value: s, label: STATUS_CONFIG[s].label }))}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#444] mb-1.5">Priority</label>
            <Select
              value={priority}
              onChange={(v) => setPriority(v as TicketPriority)}
              options={ALL_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_CONFIG[p].label }))}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#444] mb-1.5">Assignee</label>
            <Select
              value={assigneeId}
              onChange={setAssigneeId}
              options={[
                { value: "", label: "Unassigned" },
                ...employees.map((emp) => ({ value: emp.id, label: emp.name })),
              ]}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#444] mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add internal notes…"
              className="w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#bbb] focus:outline-none focus:border-[#0070f3] transition-colors resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 border border-[#eaeaea] bg-white text-sm font-medium text-[#444] py-2.5 rounded-xl hover:bg-[#fafafa] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-[#0a0a0a] text-white text-sm font-medium py-2.5 rounded-xl hover:bg-[#333] transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CACHE_KEY = "tickets-cache-v1";

function readCache(): { tickets: EmailTicket[]; total: number; nextPageToken: string | null } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function writeCache(data: { tickets: EmailTicket[]; total: number; nextPageToken: string | null }) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export default function TicketsPage() {
  const router = useRouter();
  const [emailTickets, setEmailTickets]   = useState<EmailTicket[]>([]);
  const [manualTickets, setManualTickets] = useState<ManualTicket[]>([]);
  const [emailTotal, setEmailTotal]       = useState<number | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore]     = useState(false);
  const [metaMap, setMetaMap]             = useState<Record<string, TicketMeta>>({});
  const [employees, setEmployees]         = useState<Employee[]>([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [apiError, setApiError]           = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [search, setSearch]               = useState("");
  const [, forceNotifTick]                = useState(0);

  // Re-render "New" tags live as TicketWatcher adds notifications or a ticket gets opened
  useEffect(() => {
    function onNotif() { forceNotifTick((n) => n + 1); }
    window.addEventListener("app-notification", onNotif);
    return () => window.removeEventListener("app-notification", onNotif);
  }, []);
  const [statusFilter, setStatusFilter]   = useState<TicketStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "all">("all");
  const [assignModal, setAssignModal]     = useState<UnifiedTicket | null>(null);

  const applyResponse = useCallback((data: { tickets: EmailTicket[]; total?: number; nextPageToken?: string | null }) => {
    setNotConfigured(false);
    setApiError(null);
    setEmailTickets(data.tickets);
    setNextPageToken(data.nextPageToken ?? null);
    if (data.total != null) setEmailTotal(data.total);
  }, []);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets");
      const data = await res.json() as { tickets: EmailTicket[]; total?: number; nextPageToken?: string | null; error?: string };
      if (data.error === "not_configured") {
        setNotConfigured(true);
        setEmailTickets([]);
      } else if (data.error) {
        setApiError(data.error);
        setEmailTickets([]);
      } else {
        applyResponse(data);
        writeCache({ tickets: data.tickets, total: data.total ?? data.tickets.length, nextPageToken: data.nextPageToken ?? null });
      }
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Failed to fetch tickets");
    }
  }, [applyResponse]);

  useEffect(() => {
    // Retire pre-per-ticket-tracking notifications (no ticketId, so they can
    // never be cleared by opening a specific ticket) so they don't permanently
    // inflate the sidebar badge.
    markLegacyTicketNotificationsRead();

    // Show cached data immediately so the page isn't blank while fetching
    const cached = readCache();
    if (cached) {
      applyResponse(cached);
      setLoading(false);
    }

    fetchTickets().finally(() => setLoading(false));

    const interval = setInterval(fetchTickets, 60_000);

    const unsubMeta = subscribeAllTicketMeta((metas) => {
      const map: Record<string, TicketMeta> = {};
      metas.forEach((m) => { map[m.id] = m; });
      setMetaMap(map);
    });
    const unsubManual = subscribeManualTickets(setManualTickets);
    const unsubEmp = subscribeEmployees(setEmployees);
    return () => { clearInterval(interval); unsubMeta(); unsubManual(); unsubEmp(); };
  }, [fetchTickets]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchTickets();
    setRefreshing(false);
  }

  async function handleLoadMore() {
    if (!nextPageToken) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/tickets?pageToken=${encodeURIComponent(nextPageToken)}`);
      const data = await res.json() as { tickets: EmailTicket[]; nextPageToken?: string | null };
      setEmailTickets((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const fresh = data.tickets.filter((t) => !existingIds.has(t.id));
        return [...prev, ...fresh];
      });
      setNextPageToken(data.nextPageToken ?? null);
    } catch { /* ignore */ }
    setLoadingMore(false);
  }

  const unified: UnifiedTicket[] = useMemo(() => {
    const fromEmail: UnifiedTicket[] = emailTickets.map((t) => {
      const meta = metaMap[t.id];
      return {
        id:           t.id,
        source:       "email" as TicketSource,
        threadId:     t.threadId,
        subject:      t.subject,
        fromName:     t.fromName,
        from:         t.from,
        snippet:      t.snippet,
        receivedAt:   t.receivedAt,
        isUnread:     t.isUnread,
        status:       meta?.status      ?? "open",
        priority:     meta?.priority    ?? "medium",
        assigneeId:   meta?.assigneeId,
        assigneeName: meta?.assigneeName,
        notes:        meta?.notes,
      };
    });
    const fromManual: UnifiedTicket[] = manualTickets.map((t) => ({
      id:           t.id,
      source:       t.source,
      ticketNumber: t.ticketNumber,
      subject:      t.subject,
      fromName:     t.customerName,
      from:         t.customerEmail ?? t.customerPhone ?? "",
      snippet:      t.description,
      receivedAt:   t.createdAt,
      isUnread:     false,
      description:  t.description,
      status:       t.status,
      priority:     t.priority,
      assigneeId:   t.assigneeId,
      assigneeName: t.assigneeName,
      notes:        t.notes,
    }));
    return [...fromEmail, ...fromManual].sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );
  }, [emailTickets, manualTickets, metaMap]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return unified.filter((t) => {
      if (q && !t.subject.toLowerCase().includes(q) && !t.from.toLowerCase().includes(q) && !t.fromName.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      return true;
    });
  }, [unified, search, statusFilter, priorityFilter]);

  const kpis = useMemo(() => ({
    total:      unified.length,
    open:       unified.filter((t) => t.status === "open").length,
    inProgress: unified.filter((t) => t.status === "in-progress").length,
    resolved:   unified.filter((t) => t.status === "resolved").length,
    unassigned: unified.filter((t) => !t.assigneeId).length,
  }), [unified]);

  // Fire the "how did we do" review-request email. Both routes dedupe by
  // ticket id, so it's safe to call this any time the ticket is closed —
  // on creation already-closed, on a later edit, or after being reopened
  // and re-closed. Manual tickets look their customer info up server-side
  // (from Supabase); email tickets only exist in the mailbox, so we pass
  // along what the page already has loaded from Microsoft Graph.
  function fireReviewRequest(opts: { id: string; isManual: boolean; subject: string; customerEmail?: string; customerName?: string }) {
    const { id, isManual, subject, customerEmail, customerName } = opts;
    const url = isManual ? `/api/tickets/manual/${id}/review-request` : `/api/tickets/${id}/review-request`;
    fetch(url, {
      method: "POST",
      ...(isManual ? {} : {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerEmail, customerName, subject }),
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!data.reviewSent) console.error("[review-request] not sent:", data.reason ?? data.error ?? res.status);
      })
      .catch((err) => console.error("[review-request] request failed:", err));
  }

  async function handleCreateTicket(data: Omit<ManualTicket, "id" | "ticketNumber" | "createdAt" | "updatedAt">) {
    const id = await createManualTicket(data);
    logActivity({
      category: "access",
      action: "Ticket created",
      detail: `Manual ticket "${data.subject}" created via ${data.source} for ${data.customerName}`,
    });

    if (data.status === "closed") {
      fireReviewRequest({ id, isManual: true, subject: data.subject, customerEmail: data.customerEmail, customerName: data.customerName });
    }
  }

  async function handleSave(ticket: UnifiedTicket, patch: Partial<TicketMeta>) {
    const isManual = ticket.source !== "email";
    const { id, subject } = ticket;
    if (isManual) {
      await upsertManualTicket(id, patch);
    } else {
      await upsertTicket(id, patch);
    }
    logActivity({
      category: "access",
      action: "Ticket updated",
      detail: `Ticket "${subject}" updated — status: ${patch.status ?? "unchanged"}, assignee: ${patch.assigneeName ?? "unassigned"}`,
    });

    if (patch.status === "closed") {
      fireReviewRequest({ id, isManual, subject, customerEmail: ticket.from, customerName: ticket.fromName });
    }
  }

  const modalTicket = assignModal ? unified.find((t) => t.id === assignModal.id) ?? null : null;

  // Only block on loading when there is genuinely no data yet (no cache, first visit)
  if (loading && emailTickets.length === 0 && manualTickets.length === 0) {
    return (
      <div>
        <Header title="Tickets" subtitle="Loading…" />
        <div className="flex items-center justify-center py-32 text-sm text-[#999]">
          Loading tickets…
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title="Tickets"
        subtitle={emailTotal != null && emailTotal > emailTickets.length ? `${unified.length} loaded · ${emailTotal} email threads` : `${unified.length} ticket${unified.length !== 1 ? "s" : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewTicket(true)}
              className="flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-[#222] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Ticket
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 border border-[#eaeaea] text-sm font-medium text-[#444] px-3 py-2 rounded-lg hover:bg-[#fafafa] hover:text-[#0a0a0a] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        }
      />

      {notConfigured && (
        <div className="mb-6 bg-[#fffbeb] border border-[#fde68a] rounded-xl p-5">
          <p className="text-sm font-semibold text-[#b45309] mb-1">Microsoft 365 credentials not configured</p>
          <p className="text-sm text-[#92400e]">
            Set <code className="font-mono bg-[#fef3c7] px-1 rounded">MS_TICKETS_TENANT_ID</code>,{" "}
            <code className="font-mono bg-[#fef3c7] px-1 rounded">MS_TICKETS_CLIENT_ID</code>, and{" "}
            <code className="font-mono bg-[#fef3c7] px-1 rounded">MS_TICKETS_CLIENT_SECRET</code> in your{" "}
            <code className="font-mono bg-[#fef3c7] px-1 rounded">.env.local</code> to connect to{" "}
            <strong>ticket@atlantisutility.com</strong> via an app-only Microsoft Graph application.
          </p>
        </div>
      )}

      {apiError && !notConfigured && (
        <div className="mb-6 bg-[#fef2f2] border border-[#fecaca] rounded-xl p-5">
          <p className="text-sm font-semibold text-[#b91c1c] mb-1">Failed to load tickets</p>
          <p className="text-sm text-[#991b1b] font-mono">{apiError}</p>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:items-stretch md:divide-x divide-[#f4f4f4] bg-white border border-[#eaeaea] rounded-xl mb-5 overflow-hidden">
        {[
          { label: "Total",       value: kpis.total      },
          { label: "Open",        value: kpis.open       },
          { label: "In Progress", value: kpis.inProgress },
          { label: "Resolved",    value: kpis.resolved   },
          { label: "Unassigned",  value: kpis.unassigned },
        ].map(({ label, value }, i) => (
          <div key={label} className={`px-4 py-4 md:flex-1 md:px-5 md:py-5 ${i < 4 ? "border-b md:border-b-0 border-[#f4f4f4]" : ""}`}>
            <p className="text-2xl font-bold tabular-nums leading-none text-[#0a0a0a]">{value}</p>
            <p className="text-[11px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
          <input
            type="text"
            placeholder="Search by subject or sender…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-[#eaeaea] rounded-lg pl-9 pr-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#0070f3] transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(["all", ...ALL_STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                statusFilter === s
                  ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                  : "bg-white text-[#666] border-[#eaeaea] hover:border-[#ccc]"
              }`}
            >
              {s === "all" ? "All" : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>

        <div className="w-40">
          <Select
            value={priorityFilter}
            onChange={(v) => setPriorityFilter(v as TicketPriority | "all")}
            options={[
              { value: "all", label: "All Priorities" },
              ...ALL_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_CONFIG[p].label })),
            ]}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <TicketCheck className="w-8 h-8 text-[#ddd] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#999]">
              {unified.length === 0 ? "No tickets yet" : "No tickets match your filters"}
            </p>
            <p className="text-xs text-[#bbb] mt-1">
              {unified.length === 0
                ? "Emails to ticket@atlantisutility.com or manually created tickets will appear here"
                : "Try adjusting the search or filter"}
            </p>
          </div>
        ) : (
          <table className="w-full min-w-200">
            <thead>
              <tr className="border-b border-[#eaeaea] bg-[#fafafa]">
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Subject</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Source</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Priority</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Assignee</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Received</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ticket) => {
                const statusCfg   = STATUS_CONFIG[ticket.status];
                const priorityCfg = PRIORITY_CONFIG[ticket.priority];
                const sourceCfg   = SOURCE_CONFIG[ticket.source];
                const isEmail     = ticket.source === "email";
                return (
                  <tr
                    key={ticket.id}
                    onClick={() => isEmail ? router.push(`/tickets/${ticket.id}`) : setAssignModal(ticket)}
                    className={`border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors cursor-pointer ${
                      ticket.isUnread ? "border-l-2 border-l-[#0070f3]" : ""
                    }`}
                  >
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium text-[#0a0a0a] truncate ${ticket.isUnread ? "font-semibold" : ""}`}>
                          {ticket.ticketNumber ? `#${ticket.ticketNumber} ` : ""}{ticket.subject}
                        </p>
                        {isTicketUnread(ticket.id) && (
                          <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#dcfce7] text-[#16a34a]">
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#999] truncate mt-0.5">{ticket.fromName || ticket.from}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${sourceCfg.color}`}>
                        {sourceCfg.icon} {sourceCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${statusCfg.bg} ${statusCfg.text}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${priorityCfg.bg} ${priorityCfg.text}`}>
                        {priorityCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[#666]">
                        {ticket.assigneeName ?? <span className="text-[#bbb]">Unassigned</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[#666]">{timeAgo(ticket.receivedAt)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); setAssignModal(ticket); }}
                        className="text-xs font-medium border border-[#eaeaea] text-[#444] px-3 py-1.5 rounded-lg hover:bg-[#f5f5f5] hover:border-[#d4d4d4] transition-colors"
                      >
                        Assign
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-[#999]">
          Showing {filtered.length} of {unified.length} tickets
          {emailTotal != null && emailTotal > emailTickets.length ? ` · ${emailTotal} email threads in inbox` : ""}
        </p>
        {nextPageToken && (
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-1.5 text-xs font-medium border border-[#eaeaea] text-[#444] px-3 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loadingMore ? "animate-spin" : ""}`} />
            {loadingMore ? "Loading…" : "Load more email tickets"}
          </button>
        )}
      </div>

      {modalTicket && (
        <AssignModal
          ticket={modalTicket}
          employees={employees}
          onSave={(patch) => handleSave(modalTicket, patch)}
          onClose={() => setAssignModal(null)}
        />
      )}

      {showNewTicket && (
        <NewTicketDrawer
          employees={employees}
          onSave={handleCreateTicket}
          onClose={() => setShowNewTicket(false)}
        />
      )}
    </div>
  );
}
