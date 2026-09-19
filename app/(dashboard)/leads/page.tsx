"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/lib/confirm";
import { useToast } from "@/lib/toast";
import Header from "@/components/layout/Header";
import Select from "@/components/ui/Select";
import CopyButton from "@/components/ui/CopyButton";
import ImportLeadsCsvModal from "@/components/leads/ImportLeadsCsvModal";
import LeadFormModal from "@/components/leads/LeadFormModal";
import LeadDetailDrawer from "@/components/leads/LeadDetailDrawer";
import LeadStageBoard from "@/components/leads/LeadStageBoard";
import AssignLeadsModal from "@/components/leads/AssignLeadsModal";
import LeadsAccessModal from "@/components/leads/LeadsAccessModal";
import DiscoverPanel from "@/components/leads/DiscoverPanel";
import StatusPicker from "@/components/leads/StatusPicker";
import LeadsTabs from "@/components/leads/LeadsTabs";
import ReviewChangesModal from "@/components/campaigns/ReviewChangesModal";
import Tooltip from "@/components/ui/Tooltip";
import {
  usePendingForLeads,
  LEAD_FIELD_LABELS,
  type EditableLeadField,
  type LeadChangeRequest,
} from "@/lib/db/lead-changes";
import AddToCampaignModal from "@/components/campaigns/AddToCampaignModal";
import {
  criteriaFromLeadFilters,
  fetchLeadFieldValues,
  type CampaignFill,
  type LeadFacet,
} from "@/lib/db/campaigns";
import { useEmployees } from "@/lib/db/employees";
import { useAuth } from "@/lib/auth-context";
import { hasPageAccess } from "@/lib/nav-pages";
import { useLeadsAccess } from "@/lib/leads-access";
import { useIsOwner } from "@/lib/db/ownership";
import { useRouter, useSearchParams } from "next/navigation";
import {
  queryLeadsPage,
  queryLeadsBoard,
  leadsQueryKey,
  useLeadsRevision,
  updateLead,
  deleteLeadsBulk,
  setLeadsStatusBulk,
  EMPTY_FILTERS,
  STALE_DAYS,
  type Lead,
  type LeadStatus,
  type LeadFilters,
  type LeadQuery,
  type LeadSortKey,
  type LeadsPageResult,
  type LeadsBoardResult,
  type BulkTarget,
} from "@/lib/db/leads";
import {
  STATUS_OPTIONS,
  SETTABLE_STATUS_OPTIONS,
  STATUS_STYLES,
  STATUS_LABELS,
  STATUS_ICONS,
  PRIORITY_OPTIONS,
  PRIORITY_STYLES,
  SOURCE_LABELS,
  isFollowUpOverdue,
} from "@/lib/leads-constants";
import { getAvatarColor, getInitials, getErrorMessage, formatPhone, telHref, withScheme, emailAddress } from "@/lib/utils";
import {
  Target,
  Plus,
  FileSpreadsheet,
  Building2,
  Trash2,
  ExternalLink,
  AlertTriangle,
  User,
  Table2,
  Columns3,
  Shield,
  UserCheck,
  Eye,
  Loader2,
  Search,
  Clock,
  Compass,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Megaphone,
} from "lucide-react";

type View = "table" | "board";

const PAGE_SIZE_OPTIONS = [
  { value: "25", label: "25 per page" },
  { value: "50", label: "50 per page" },
  { value: "100", label: "100 per page" },
];

// How many cards each stage column loads. A stage can hold thousands of
// leads; the column header carries the real count and these are a window.
const BOARD_PER_COLUMN = 25;

// New is deliberately not a board column: it means "nobody has touched
// this yet", so it's a pile to work from rather than a stage to work in.
// Those leads stay reachable in the table via the All stages filter.
const BOARD_STAGES = SETTABLE_STATUS_OPTIONS.map((s) => s.value);

const SORT_LABELS: Record<LeadSortKey, string> = {
  updated_at: "Last updated",
  company_name: "Company",
  follow_up_date: "Follow-up",
};

/**
 * A lead fact, showing an unapproved correction in the amber the rest of the
 * app uses for "waiting on someone" when one is pending.
 *
 * The proposed value is what's shown, not the stored one: a caller who has
 * just been told the number changed needs the new number in front of them,
 * and the colour plus the row's tag say it isn't final yet.
 */
function Fact({
  value,
  pending,
  className = "",
  empty = "-",
}: {
  value?: string;
  pending?: string | null;
  className?: string;
  empty?: string;
}) {
  const text = ((pending ?? value) ?? "").trim();
  return (
    <span
      className={`${className} ${pending ? "text-[#946c00]" : ""}`}
      title={pending ? `Proposed from a campaign sheet, waiting for approval. On file: ${value?.trim() || "empty"}` : undefined}
    >
      {text || empty}
    </span>
  );
}

/** The row's "changed, not yet approved" tag, listing what would change. */
function PendingTag({ changes, onReview }: { changes: LeadChangeRequest[]; onReview?: () => void }) {
  if (changes.length === 0) return null;
  const who = changes.find((c) => c.requestedByName)?.requestedByName;
  const lines = [
    ...changes.map(
      (c) => `${LEAD_FIELD_LABELS[c.field]}: ${c.oldValue?.trim() || "empty"} -> ${c.newValue?.trim() || "empty"}`,
    ),
    who ? `Asked by ${who}` : "",
    onReview ? "Click to review" : "Waiting for an administrator",
  ];
  const chip = (
    <span className="text-[9px] font-semibold uppercase tracking-wide text-[#946c00] bg-[#fefce8] border border-[#f7e6a8] rounded px-1 py-0.5 shrink-0">
      Updated
    </span>
  );
  return (
    <Tooltip label={lines}>
      {onReview ? (
        <button onClick={onReview} className="cursor-pointer">
          {chip}
        </button>
      ) : (
        chip
      )}
    </Tooltip>
  );
}

export default function LeadsPage() {
  const employees = useEmployees();
  const access = useLeadsAccess();
  const isOwner = useIsOwner();
  const confirm = useConfirm();
  const { authUser } = useAuth();
  // Campaigns is a separate page grant, so the tab is only offered to
  // someone who could actually open a campaign. Without this the tab would
  // be visible and the page behind it would 404.
  const canSeeCampaigns = hasPageAccess("/leads/campaigns", authUser?.access);
  const revision = useLeadsRevision();

  const [view, setView] = useState<View>("table");
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState<LeadSortKey>("updated_at");
  const [desc, setDesc] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const [result, setResult] = useState<LeadsPageResult | null>(null);
  const [board, setBoard] = useState<LeadsBoardResult | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // "Select all N matching", a filter-wide selection that never materializes
  // ids client-side, so acting on ten thousand leads stays one request.
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showAddToCampaign, setShowAddToCampaign] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  // Which lead's drawer is open. Two sources, no effect syncing them: a row
  // click, and ?lead=<id> from the navbar's global search, which is how
  // searching a phone number gets you to the lead that owns it. The drawer
  // fetches the lead itself, so a deep-linked lead doesn't have to be on the
  // page you happen to be looking at. Closing a deep-linked one cleans the
  // URL, so the same search can open it again.
  const searchParams = useSearchParams();
  const router = useRouter();
  const linkedLeadId = searchParams.get("lead");
  const [rowLeadId, setRowLeadId] = useState<string | null>(null);
  const openLeadId = rowLeadId ?? linkedLeadId;

  function closeLead() {
    setRowLeadId(null);
    if (linkedLeadId) router.replace("/leads");
  }
  const [busy, setBusy] = useState(false);
  const { success, error: notifyError } = useToast();

  const actor = useMemo(
    () => (access.myEmployeeId ? { id: access.myEmployeeId, name: access.myName } : null),
    [access.myEmployeeId, access.myName],
  );

  // Loaded once: the distinct cities across the leads this reader can see,
  // with how many are in each. Aggregated in SQL, because working it out
  // client-side would mean holding every lead.
  const [cityFacets, setCityFacets] = useState<LeadFacet[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchLeadFieldValues("city")
      .then((values) => {
        if (!cancelled) setCityFacets(values);
      })
      // A missing facet function just means no city list; the rest of the
      // page is unaffected, so this isn't worth an error banner.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const cityOptions = useMemo(
    () => cityFacets.map((f) => ({ value: f.value, label: `${f.value} (${f.count.toLocaleString()})` })),
    [cityFacets],
  );

  /* ─── Filters ──────────────────────────────────────────────────────── */

  // Any change to what's being looked at invalidates a selection made
  // against the previous result set, especially the filter-wide one, which
  // would otherwise silently retarget at whatever the new filter matches.
  const applyFilters = useCallback((next: Partial<LeadFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
    setPage(0);
    setSelectedIds(new Set());
    setAllMatchingSelected(false);
  }, []);

  // Debounced: typing in the search box shouldn't fire a query per keystroke
  // against a table this size.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const clearFilters = () => {
    setSearchInput("");
    applyFilters(EMPTY_FILTERS);
  };

  const hasFilters = useMemo(() => JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS), [filters]);

  /* ─── Data ─────────────────────────────────────────────────────────── */

  const query: LeadQuery = useMemo(
    () => ({ filters, sort, desc, page, pageSize }),
    [filters, sort, desc, page, pageSize],
  );
  const queryKey = leadsQueryKey(query);

  useEffect(() => queryLeadsPage(query, setResult), [query, revision]);

  useEffect(() => {
    if (view !== "board") return;
    return queryLeadsBoard(filters, BOARD_STAGES, BOARD_PER_COLUMN, sort, desc, setBoard);
  }, [view, filters, sort, desc, revision]);

  const isCurrent = result?.key === queryKey;
  const loading = !isCurrent;
  // Keeps the previous page on screen while the next one loads instead of
  // flashing an empty table on every filter change.
  const rows = result?.rows ?? [];
  const stats = result?.stats ?? null;
  const total = stats?.total ?? 0;
  // Corrections proposed on a campaign sheet, for the leads on this page. A
  // campaign is a view onto these same leads, so an edit made while calling
  // one shows here too, for anyone who can see the lead, whether or not they
  // hold that campaign.
  const pendingByLead = usePendingForLeads(rows.map((l) => l.id));
  const [showReview, setShowReview] = useState(false);
  const queryError = result?.error ?? "";

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Leads can disappear under the current offset, someone else reassigns
  // them, or a bulk delete empties the tail of the list. Surfaced as a
  // recoverable empty page rather than silently jumping the user somewhere
  // they didn't ask to go.
  const pastEnd = isCurrent && rows.length === 0 && page > 0 && total > 0;


  /* ─── Selection ────────────────────────────────────────────────────── */

  const selectedCount = allMatchingSelected ? total : selectedIds.size;

  const bulkTarget: BulkTarget = allMatchingSelected
    ? { kind: "filters", filters }
    : { kind: "ids", ids: [...selectedIds] };

  // The same target, in the shape campaigns take. Filter-wide selections stay
  // filter-wide, so adding 9,000 leads to a campaign never ships 9,000 ids.
  const campaignFill: CampaignFill = allMatchingSelected
    ? { kind: "criteria", criteria: criteriaFromLeadFilters(filters) }
    : { kind: "ids", ids: [...selectedIds] };

  function toggleSelect(id: string) {
    setAllMatchingSelected(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pageFullySelected = rows.length > 0 && rows.every((l) => selectedIds.has(l.id));

  function toggleSelectPage() {
    setAllMatchingSelected(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (pageFullySelected) rows.forEach((l) => next.delete(l.id));
      else rows.forEach((l) => next.add(l.id));
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setAllMatchingSelected(false);
  }

  /* ─── Mutations ────────────────────────────────────────────────────── */

  async function setStatus(lead: Lead, status: LeadStatus) {
    try {
      await updateLead(lead.id, { status }, actor);
    } catch (err) {
      notifyError(getErrorMessage(err, "Failed to update stage"));
    }
  }

  async function bulkStatus(status: LeadStatus) {
    setBusy(true);
    try {
      const changed = await setLeadsStatusBulk(bulkTarget, status, actor);
      // Reports what actually happened, not what was asked: leads already in
      // that stage aren't counted, and a member without rights gets 0.
      success(
        changed === 0
          ? "No leads were moved, they may already be in that stage, or you may not have permission to change them."
          : `Moved ${changed.toLocaleString()} lead${changed !== 1 ? "s" : ""} to ${STATUS_LABELS[status]}.`,
      );
      clearSelection();
    } catch (err) {
      notifyError(getErrorMessage(err, "Failed to move leads"));
    } finally {
      setBusy(false);
    }
  }

  async function bulkDelete() {
    const label = allMatchingSelected
      ? `all ${total.toLocaleString()} matching lead${total !== 1 ? "s" : ""}`
      : `${selectedCount.toLocaleString()} lead${selectedCount !== 1 ? "s" : ""}`;
    const ok = await confirm({
      title: `Delete ${label}?`,
      description: "Their notes and history go too. This can't be undone.",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const deleted = await deleteLeadsBulk(bulkTarget);
      // The current offset may no longer exist after removing this many rows.
      setPage(0);
      success(
        deleted === 0
          ? "Nothing was deleted, you may not have permission to delete these leads."
          : `Deleted ${deleted.toLocaleString()} lead${deleted !== 1 ? "s" : ""}.`,
      );
      clearSelection();
    } catch (err) {
      notifyError(getErrorMessage(err, "Failed to delete leads"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteOne(lead: Lead) {
    const ok = await confirm({
      title: `Delete "${lead.companyName}"?`,
      description: "Its notes and history go too. This can't be undone.",
    });
    if (!ok) return;
    try {
      const deleted = await deleteLeadsBulk({ kind: "ids", ids: [lead.id] });
      if (deleted === 0) notifyError("That lead wasn't deleted, you may not have permission.");
    } catch (err) {
      notifyError(getErrorMessage(err, "Failed to delete lead"));
    }
  }

  function toggleSort(key: LeadSortKey) {
    if (sort === key) {
      setDesc((d) => !d);
    } else {
      setSort(key);
      setDesc(key !== "company_name"); // names read better A→Z, everything else newest/largest first
    }
    setPage(0);
  }

  /* ─── Derived display ──────────────────────────────────────────────── */

  const statCards = useMemo(() => {
    const cards = [
      {
        label: hasFilters ? "Matching Leads" : access.isAdmin ? "Total Leads" : "Leads You Can See",
        value: total.toLocaleString(),
      },
      { label: "Overdue Follow-ups", value: (stats?.overdue ?? 0).toLocaleString() },
      { label: `No Activity (${STALE_DAYS}d+)`, value: (stats?.stale ?? 0).toLocaleString() },
      // The outcome that matters for a calling team, as a count rather than a
      // rate, a percentage over 10,000 mostly-uncalled leads says nothing.
      { label: "Appointments", value: (stats?.appointments ?? 0).toLocaleString() },
    ];
    // Unassigned leads are invisible to everyone but an administrator, so the
    // count is only actionable (and only meaningful) for one.
    if (access.isAdmin) {
      cards.splice(1, 0, { label: "Unassigned", value: (stats?.unassigned ?? 0).toLocaleString() });
    }
    return cards;
  }, [stats, total, hasFilters, access.isAdmin]);

  const ownerOptions = useMemo(
    () => [{ value: "unassigned", label: "Unassigned" }, ...employees.map((e) => ({ value: e.id, label: e.name }))],
    [employees],
  );

  const sortButton = (key: LeadSortKey, label: string) => (
    <button
      onClick={() => toggleSort(key)}
      className={`flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider transition-colors ${
        sort === key ? "text-[#0070f3]" : "text-[#999] hover:text-[#666]"
      }`}
    >
      {label}
      {sort === key && (desc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
    </button>
  );

  return (
    <div>
      <Header
        title="Leads"
        subtitle={
          loading && !result
            ? "Loading…"
            : access.isAdmin
              ? `${total.toLocaleString()} lead${total !== 1 ? "s" : ""}${hasFilters ? " matching" : " on file"}`
              : `${total.toLocaleString()} lead${total !== 1 ? "s" : ""} you can see`
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {access.canGrant && (
              <button
                onClick={() => setShowAccess(true)}
                className="flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-3 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
              >
                <Shield className="w-4 h-4" />
                <span className="hidden sm:inline">Lead access</span>
              </button>
            )}
            {/* Discovery and CSV import both create leads with no owner, which
                the database only permits for an administrator, so these stay
                hidden rather than failing on submit for a member. */}
            {access.isAdmin && (
              <button
                onClick={() => setShowDiscover((s) => !s)}
                className={`flex items-center gap-2 border text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                  showDiscover
                    ? "border-[#0070f3] bg-[#eff6ff] text-[#0070f3]"
                    : "border-[#eaeaea] bg-white text-[#0a0a0a] hover:bg-[#fafafa]"
                }`}
              >
                <Compass className="w-4 h-4" />
                <span className="hidden sm:inline">Discover</span>
              </button>
            )}
            {access.isAdmin && (
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-3 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="hidden sm:inline">Import</span>
              </button>
            )}
            {access.canCreate && (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 bg-[#0070f3] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#005fcc] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Lead
              </button>
            )}
          </div>
        }
      />

      {access.isReadOnly && (
        <div className="flex items-start gap-2 mb-4 px-4 py-2.5 rounded-lg bg-[#f1f1f1] text-[#666] text-sm">
          <Eye className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            You have read-only access to these leads. You can see these leads and their history, but not change them.
          </p>
        </div>
      )}

      {!access.isAdmin && !access.myEmployeeId && (
        <div className="flex items-start gap-2 mb-4 px-4 py-2.5 rounded-lg bg-[#fefce8] text-[#f5a524] text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Your login isn&apos;t linked to an employee record, so no leads can be assigned to you. Ask an administrator
            to add you under Employees with your work email.
          </p>
        </div>
      )}

      {/* A page that couldn't load its rows is a state you need to keep
          reading, not an event, so it stays here. Everything that happens
          because of an action is a toast. */}
      {queryError && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-[#fef2f2] text-[#f31260] text-sm">{queryError}</div>
      )}


      <LeadsTabs active="leads" canSeeCampaigns={canSeeCampaigns} />

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-px bg-[#f4f4f4] border border-[#eaeaea] rounded-xl mb-5 overflow-hidden">
          {statCards.map((k) => (
            <div key={k.label} className="bg-white px-4 py-4 md:px-5 md:py-5">
              <p className="text-2xl font-bold tabular-nums leading-none text-[#0a0a0a] truncate">{k.value}</p>
              <p className="text-[11px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">{k.label}</p>
            </div>
          ))}
        </div>

        {showDiscover && access.isAdmin && (
          <DiscoverPanel
            actor={actor}
            onSaved={() => success("Saved as a new lead. Assign it to someone so they can see it.")}
          />
        )}

        <div className="bg-white border border-[#eaeaea] rounded-xl">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-[#eaeaea] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-[#f5f5f5] rounded-lg shrink-0">
                  {[
                    { value: "table" as View, label: "Table", icon: Table2 },
                    { value: "board" as View, label: "Stages", icon: Columns3 },
                  ].map((v) => (
                    <button
                      key={v.value}
                      onClick={() => setView(v.value)}
                      className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors ${
                        view === v.value ? "bg-white text-[#0a0a0a] shadow-sm" : "text-[#666] hover:text-[#0a0a0a]"
                      }`}
                    >
                      <v.icon className="w-3.5 h-3.5" />
                      {v.label}
                    </button>
                  ))}
                </div>
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#999]" />}
              </div>

              <div className="relative flex-1 min-w-48 max-w-sm">
                <Search className="w-3.5 h-3.5 text-[#bbb] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search company, contact, phone, city…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="text-sm border border-[#eaeaea] rounded-lg pl-9 pr-3 py-1.5 w-full outline-none focus:border-[#0070f3] transition-colors"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {access.myEmployeeId && (
                <button
                  onClick={() =>
                    applyFilters({
                      assignedTo: filters.assignedTo === access.myEmployeeId ? "" : access.myEmployeeId,
                    })
                  }
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                    filters.assignedTo === access.myEmployeeId
                      ? "border-[#0070f3] bg-[#eff6ff] text-[#0070f3]"
                      : "border-[#eaeaea] text-[#666] hover:bg-[#fafafa]"
                  }`}
                >
                  <User className="w-3.5 h-3.5" /> My Leads
                </button>
              )}
              <button
                onClick={() => applyFilters({ overdue: !filters.overdue })}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  filters.overdue
                    ? "border-[#f31260] bg-[#fef2f2] text-[#f31260]"
                    : "border-[#eaeaea] text-[#666] hover:bg-[#fafafa]"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Overdue
              </button>
              <button
                onClick={() => applyFilters({ stale: !filters.stale })}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  filters.stale
                    ? "border-[#f5a524] bg-[#fefce8] text-[#f5a524]"
                    : "border-[#eaeaea] text-[#666] hover:bg-[#fafafa]"
                }`}
              >
                <Clock className="w-3.5 h-3.5" /> No activity
              </button>

              <div className="w-36">
                <Select
                  value={filters.status}
                  onChange={(v) => applyFilters({ status: v })}
                  placeholder="All stages"
                  options={STATUS_OPTIONS}
                  clearable
                />
              </div>
              <div className="w-36">
                <Select
                  value={filters.priority}
                  onChange={(v) => applyFilters({ priority: v })}
                  placeholder="Any priority"
                  options={PRIORITY_OPTIONS}
                  clearable
                />
              </div>
              {/* Cities come from the leads themselves, with counts, so the
                  list is what's actually on file rather than a fixed set, and
                  it's scoped by RLS to the leads this reader can see. */}
              <div className="w-40">
                <Select
                  value={filters.city}
                  onChange={(v) => applyFilters({ city: v })}
                  placeholder="Any city"
                  options={cityOptions}
                  searchable
                  clearable
                />
              </div>
              {/* An owner filter only means anything to someone who can see more
              than their own leads. */}
              {(access.isAdmin || access.globalLevel) && (
                <div className="w-40">
                  <Select
                    value={filters.assignedTo}
                    onChange={(v) => applyFilters({ assignedTo: v })}
                    placeholder="All owners"
                    options={ownerOptions}
                    searchable
                    clearable
                  />
                </div>
              )}
              {hasFilters && (
                <button onClick={clearFilters} className="text-xs text-[#666] hover:text-[#0a0a0a] underline px-1">
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedCount > 0 && access.isAdmin && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[#eff6ff] border-b border-[#eaeaea]">
              <p className="text-xs font-medium text-[#0070f3]">
                {selectedCount.toLocaleString()} selected
                {allMatchingSelected && " (everything matching these filters)"}
              </p>
              {/* Offering "select all" only makes sense when there's more than
              this page to select. */}
              {!allMatchingSelected && total > rows.length && (
                <button
                  onClick={() => {
                    setAllMatchingSelected(true);
                    setSelectedIds(new Set());
                  }}
                  className="text-xs text-[#0070f3] underline"
                >
                  Select all {total.toLocaleString()}
                </button>
              )}
              <div className="w-36">
                <Select
                  value=""
                  onChange={(v) => v && bulkStatus(v as LeadStatus)}
                  placeholder="Move to stage"
                  // Setting a stage, so "New" isn't offered, same rule as the
                  // per-row picker. The filter above still lists it.
                  options={SETTABLE_STATUS_OPTIONS}
                />
              </div>
              <button
                onClick={() => setShowAssign(true)}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs font-medium bg-[#0070f3] text-white px-3 py-1.5 rounded-lg hover:bg-[#005fcc] transition-colors disabled:opacity-50"
              >
                <UserCheck className="w-3.5 h-3.5" /> Assign / share
              </button>
              {canSeeCampaigns && (
                <button
                  onClick={() => setShowAddToCampaign(true)}
                  disabled={busy}
                  className="flex items-center gap-1.5 text-xs font-medium border border-[#eaeaea] bg-white text-[#444] px-3 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
                >
                  <Megaphone className="w-3.5 h-3.5" /> Add to campaign
                </button>
              )}
              {/* Deleting leads takes their notes and history with them, so
                  it's the owner's to do rather than every administrator's.
                  The policy in SQL decides; this keeps the action from being
                  offered to someone it would refuse. */}
              {isOwner && (
                <button
                  onClick={bulkDelete}
                  disabled={busy}
                  className="flex items-center gap-1.5 text-xs font-medium border border-[#eaeaea] bg-white text-[#f31260] px-3 py-1.5 rounded-lg hover:bg-[#fff0f3] transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              )}
              <button onClick={clearSelection} className="text-xs text-[#666] hover:text-[#0a0a0a] underline">
                Clear selection
              </button>
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0070f3]" />}
            </div>
          )}

          {/* States */}
          {loading && !result && (
            <div className="p-12 text-center">
              <Loader2 className="w-5 h-5 text-[#999] mx-auto mb-3 animate-spin" />
              <p className="text-sm text-[#999]">Loading leads…</p>
            </div>
          )}

          {isCurrent && total === 0 && !hasFilters && (
            <div className="p-12 text-center">
              <Target className="w-6 h-6 text-[#999] mx-auto mb-3" />
              <p className="text-sm font-medium text-[#0a0a0a] mb-1">
                {access.isAdmin ? "No leads yet" : "No leads assigned to you yet"}
              </p>
              <p className="text-xs text-[#999]">
                {access.isAdmin
                  ? "Import a CSV, discover businesses, or add one manually."
                  : "An administrator will assign leads to you, and they'll show up here."}
              </p>
            </div>
          )}

          {isCurrent && total === 0 && hasFilters && (
            <div className="p-12 text-center">
              <p className="text-sm text-[#999] mb-2">No leads match those filters.</p>
              <button onClick={clearFilters} className="text-xs text-[#0070f3] hover:underline">
                Clear filters
              </button>
            </div>
          )}

          {pastEnd && (
            <div className="p-12 text-center">
              <p className="text-sm text-[#999] mb-2">
                This page is empty now, there are {total.toLocaleString()} leads in total.
              </p>
              <button onClick={() => setPage(0)} className="text-xs text-[#0070f3] hover:underline">
                Back to the first page
              </button>
            </div>
          )}

          {/* Board */}
          {view === "board" && total > 0 && (
            <div className="p-4">
              {board?.error && <p className="text-sm text-[#f31260] mb-3">{board.error}</p>}
              <LeadStageBoard
                columns={board?.columns ?? {}}
                counts={board?.counts ?? {}}
                canEditLead={access.canEdit}
                onOpen={setRowLeadId}
                onMove={setStatus}
                onFocusStage={(status) => {
                  setView("table");
                  applyFilters({ status });
                }}
              />
            </div>
          )}

          {/* Table */}
          {view === "table" && rows.length > 0 && (
            <>
              <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#eaeaea] bg-[#fafafa]">
                      {access.isAdmin && (
                        <th className="w-10 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={pageFullySelected || allMatchingSelected}
                            onChange={toggleSelectPage}
                            aria-label="Select all leads on this page"
                            className="w-3.5 h-3.5 accent-[#0070f3] cursor-pointer"
                          />
                        </th>
                      )}
                      <th className="text-left px-4 py-3">{sortButton("company_name", "Company")}</th>
                      <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">
                        Point of Contact
                      </th>
                      <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3 whitespace-nowrap">
                        Phone / Email
                      </th>
                      <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">
                        Location
                      </th>
                      <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">
                        Owner
                      </th>
                      <th className="text-left px-4 py-3">{sortButton("follow_up_date", "Follow-up")}</th>
                      <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">
                        Stage
                      </th>
                      <th className="w-10 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((l) => {
                      const overdue = isFollowUpOverdue(l.followUpDate, l.status);
                      const editable = access.canEdit(l);
                      const level = access.levelFor(l);
                      const changes = pendingByLead.get(l.id) ?? [];
                      const proposed = (field: EditableLeadField) =>
                        changes.find((c) => c.field === field)?.newValue ?? null;
                      return (
                        <tr
                          key={l.id}
                          className="group border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors"
                        >
                          {access.isAdmin && (
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={allMatchingSelected || selectedIds.has(l.id)}
                                onChange={() => toggleSelect(l.id)}
                                aria-label={`Select ${l.companyName}`}
                                className="w-3.5 h-3.5 accent-[#0070f3] cursor-pointer"
                              />
                            </td>
                          )}
                          {/* The copy control can't live inside the open-lead
                          button (nested buttons are invalid), so the name
                          and the copy sit as siblings in a flex row. */}
                          <td className="px-4 py-3 min-w-64">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setRowLeadId(l.id)}
                                className="flex items-center gap-2.5 text-left min-w-0"
                              >
                                <div className="w-7 h-7 rounded-lg bg-[#eff6ff] flex items-center justify-center shrink-0">
                                  <Building2 className="w-3.5 h-3.5 text-[#0070f3]" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-[#0a0a0a] truncate hover:text-[#0070f3] transition-colors">
                                    <Fact value={l.companyName} pending={proposed("companyName")} empty="" />
                                    {(proposed("dba") ?? l.dba) && (
                                      <span className="text-[#999] font-normal">
                                        {" ("}DBA <Fact value={l.dba} pending={proposed("dba")} empty="" />
                                        {")"}
                                      </span>
                                    )}
                                  </p>
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-[10px] text-[#bbb] truncate">
                                      {l.businessType || SOURCE_LABELS[l.source]}
                                    </p>
                                    {l.priority && (
                                      <span
                                        className={`text-[9px] font-semibold px-1 rounded shrink-0 ${PRIORITY_STYLES[l.priority]}`}
                                      >
                                        {l.priority.toUpperCase()}
                                      </span>
                                    )}
                                    {level === "viewer" && (
                                      <span className="flex items-center gap-0.5 text-[9px] font-semibold text-[#999] shrink-0">
                                        <Eye className="w-2.5 h-2.5" /> READ-ONLY
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </button>
                              <PendingTag
                                changes={changes}
                                onReview={access.isAdmin ? () => setShowReview(true) : undefined}
                              />
                              <CopyButton value={l.companyName ?? ""} label="company name" revealOnHover />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <div className="min-w-0">
                                <p className="text-sm text-[#0a0a0a] truncate">
                                  <Fact value={l.pocName} pending={proposed("pocName")} />
                                </p>
                                {(proposed("pocTitle") ?? l.pocTitle) && (
                                  <p className="text-xs text-[#999] truncate">
                                    <Fact value={l.pocTitle} pending={proposed("pocTitle")} empty="" />
                                  </p>
                                )}
                                {withScheme(l.linkedinUrl) && (
                                  <a
                                    href={withScheme(l.linkedinUrl)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-[#0070f3] hover:underline flex items-center gap-1 mt-0.5"
                                  >
                                    <ExternalLink className="w-3 h-3" /> LinkedIn
                                  </a>
                                )}
                              </div>
                              {l.pocName && <CopyButton value={l.pocName} label="contact name" revealOnHover />}
                            </div>
                          </td>
                          {/* Phone and email never wrap: a number broken over two
                          lines is unreadable and un-dialable, and it's the
                          column a caller actually looks at. */}
                          <td className="px-4 py-3 text-sm text-[#666] whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              {(proposed("phone") ?? l.phone) ? (
                                <>
                                  <a
                                    href={telHref(proposed("phone") ?? l.phone)}
                                    className="font-mono hover:text-[#0070f3] transition-colors"
                                  >
                                    <Fact
                                      value={formatPhone(l.phone)}
                                      pending={proposed("phone") ? formatPhone(proposed("phone")) : null}
                                    />
                                  </a>
                                  <CopyButton
                                    value={formatPhone(proposed("phone") ?? l.phone)}
                                    label="phone number"
                                    revealOnHover
                                  />
                                </>
                              ) : (
                                <span className="text-[#ccc]">-</span>
                              )}
                            </div>
                            {emailAddress(proposed("email") ?? l.email) && (
                              <div className="flex items-center gap-1">
                                <a
                                  href={`mailto:${proposed("email") ?? l.email}`}
                                  className={`text-xs hover:underline truncate max-w-44 ${
                                    proposed("email") ? "text-[#946c00]" : "text-[#0070f3]"
                                  }`}
                                  title={
                                    proposed("email")
                                      ? `Proposed from a campaign sheet, waiting for approval. On file: ${l.email?.trim() || "empty"}`
                                      : undefined
                                  }
                                >
                                  {proposed("email") ?? l.email}
                                </a>
                                <CopyButton
                                  value={proposed("email") ?? l.email ?? ""}
                                  label="email address"
                                  revealOnHover
                                />
                              </div>
                            )}
                            {!emailAddress(proposed("email") ?? l.email) && withScheme(l.website) && (
                              <a
                                href={withScheme(l.website)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-[#0070f3] hover:underline truncate block max-w-44"
                              >
                                {(l.website ?? "").replace(/^https?:\/\//, "")}
                              </a>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#666] whitespace-nowrap">
                            <Fact
                              value={[l.city, l.state].filter(Boolean).join(", ")}
                              pending={
                                proposed("city") || proposed("state")
                                  ? [proposed("city") ?? l.city, proposed("state") ?? l.state].filter(Boolean).join(", ")
                                  : null
                              }
                            />
                          </td>
                          <td className="px-4 py-3">
                            {l.assignedToName ? (
                              <div className="flex items-center gap-1.5">
                                <div
                                  className={`w-5 h-5 rounded-full ${getAvatarColor(l.assignedToName).bg} ${getAvatarColor(l.assignedToName).text} flex items-center justify-center shrink-0`}
                                >
                                  <span className="text-[8px] font-semibold">{getInitials(l.assignedToName)}</span>
                                </div>
                                <span className="text-xs text-[#666] truncate">{l.assignedToName}</span>
                              </div>
                            ) : (
                              <span className="text-sm text-[#ccc]">Unassigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {l.followUpDate ? (
                              <span
                                className={`flex items-center gap-1 text-xs ${overdue ? "text-[#f31260] font-medium" : "text-[#666]"}`}
                              >
                                {overdue && <AlertTriangle className="w-3 h-3" />}
                                {new Date(l.followUpDate).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            ) : (
                              <span className="text-sm text-[#ccc]">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {/* A read-only viewer gets the stage as a plain badge, the picker would open and then fail on write. */}
                            {editable ? (
                              <StatusPicker value={l.status} onChange={(status) => setStatus(l, status)} /> // Same pill, minus the affordance to change it.
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${STATUS_STYLES[l.status]}`}
                              >
                                {(() => {
                                  const Icon = STATUS_ICONS[l.status];
                                  return Icon ? <Icon className="w-3 h-3 shrink-0" /> : null;
                                })()}
                                {STATUS_LABELS[l.status]}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {access.canDelete && isOwner && (
                              <button
                                onClick={() => deleteOne(l)}
                                className="p-1.5 rounded-lg text-[#999] hover:text-[#f31260] hover:bg-[#fff0f3] transition-colors"
                                title="Delete lead"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-[#eaeaea]">
                <p className="text-xs text-[#999] tabular-nums">
                  {(page * pageSize + 1).toLocaleString()}–{Math.min((page + 1) * pageSize, total).toLocaleString()}{" "}
                  of {total.toLocaleString()}
                  <span className="hidden sm:inline"> · sorted by {SORT_LABELS[sort]}</span>
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-36">
                    <Select
                      value={String(pageSize)}
                      onChange={(v) => {
                        setPageSize(Number(v));
                        setPage(0);
                      }}
                      options={PAGE_SIZE_OPTIONS}
                    />
                  </div>
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0 || loading}
                    className="flex items-center gap-1 text-xs font-medium border border-[#eaeaea] bg-white text-[#444] px-2.5 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-40"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>
                  <span className="text-xs text-[#666] tabular-nums px-1">
                    {(page + 1).toLocaleString()} / {pageCount.toLocaleString()}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={page >= pageCount - 1 || loading}
                    className="flex items-center gap-1 text-xs font-medium border border-[#eaeaea] bg-white text-[#444] px-2.5 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-40"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

      {showReview && access.isAdmin && (
        <ReviewChangesModal
          onClose={() => setShowReview(false)}
          // The tags are live on lead_change_requests and the leads refetch
          // on their own realtime channel, so there is nothing to reload by
          // hand once something is approved.
          onReviewed={() => setShowReview(false)}
        />
      )}

      {showImport && access.isAdmin && (
        <ImportLeadsCsvModal
          onClose={() => setShowImport(false)}
          onImported={(count) =>
            success(
              `Imported ${count.toLocaleString()} lead${count !== 1 ? "s" : ""}. Select them to assign an owner.`,
            )
          }
          actor={actor}
        />
      )}
      {showAdd && (
        <LeadFormModal
          onClose={() => setShowAdd(false)}
          onSaved={() => success("Lead added.")}
          actor={actor}
          canAssign={access.canAssign}
          selfEmployeeId={access.myEmployeeId}
          selfName={access.myName}
        />
      )}
      {showAssign && access.isAdmin && (
        <AssignLeadsModal
          target={bulkTarget}
          count={selectedCount}
          actor={actor}
          onClose={() => setShowAssign(false)}
          onDone={(message) => {
            success(message);
            clearSelection();
          }}
        />
      )}
      {showAddToCampaign && access.isAdmin && (
        <AddToCampaignModal
          fill={campaignFill}
          count={selectedCount}
          onClose={() => setShowAddToCampaign(false)}
          onDone={(message) => {
            success(message);
            clearSelection();
          }}
        />
      )}
      {showAccess && access.canGrant && <LeadsAccessModal actor={actor} onClose={() => setShowAccess(false)} />}
      {openLeadId && <LeadDetailDrawer leadId={openLeadId} onClose={closeLead} />}
    </div>
  );
}
