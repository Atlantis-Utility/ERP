"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Users,
  Search,
  Trash2,
  Check,
  AlertTriangle,
  Download,
  ListOrdered,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
} from "lucide-react";
import Header from "@/components/layout/Header";
import CopyButton from "@/components/ui/CopyButton";
import CampaignAccessModal from "@/components/campaigns/CampaignAccessModal";
import AddLeadsToSheetModal from "@/components/campaigns/AddLeadsToSheetModal";
import { useEmployees } from "@/lib/db/employees";
import { useLeadsAccess } from "@/lib/leads-access";
import {
  useCampaigns,
  querySheet,
  sheetQueryKey,
  updateSheetRow,
  removeSheetRows,
  renumberCampaign,
  fetchSheetRows,
  EMPTY_ROW_FILTERS,
  type CampaignRow,
  type CampaignRowPatch,
  type CampaignRowFilters,
  type SheetResult,
  type SheetQuery,
} from "@/lib/db/campaigns";
import { CALL_OUTCOMES, CALL_OUTCOME_STYLES, SERVICE_SUGGESTIONS } from "@/lib/campaign-constants";
import { exportToCsv } from "@/lib/export";
import { getErrorMessage, formatPhone, telHref } from "@/lib/utils";

const PAGE_SIZE = 100;

// Shared cell chrome. A spreadsheet reads as a grid, so every cell is the
// same height with a hairline border and no rounded corners — the editable
// ones only differ by being focusable.
const CELL = "border-r border-b border-[#f0f0f0] px-2 h-9 align-middle";
const READ_CELL = `${CELL} text-[12px] text-[#666] whitespace-nowrap max-w-52 truncate`;
const INPUT =
  "w-full h-full bg-transparent text-[12px] text-[#0a0a0a] px-1 outline-none focus:bg-[#eff6ff] transition-colors";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function CampaignSheetPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params?.id ?? "";

  const employees = useEmployees();
  const access = useLeadsAccess();
  const { campaigns, loading: campaignsLoading } = useCampaigns();

  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const canEdit = campaign?.myLevel === "admin" || campaign?.myLevel === "editor";
  const isAdmin = campaign?.myLevel === "admin";

  const [filters, setFilters] = useState<CampaignRowFilters>(EMPTY_ROW_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<SheetResult | null>(null);
  const [revision, setRevision] = useState(0);

  // Saved values applied over the fetched page, so a cell keeps what you
  // typed instead of flicking back to the server copy until the next fetch.
  const [edits, setEdits] = useState<Record<string, CampaignRowPatch>>({});
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [showAccess, setShowAccess] = useState(false);
  const [showAddLeads, setShowAddLeads] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const actor = useMemo(
    () => (access.myEmployeeId ? { id: access.myEmployeeId, name: access.myName } : null),
    [access.myEmployeeId, access.myName],
  );

  /* ─── Data ─────────────────────────────────────────────────────────── */

  const query: SheetQuery = useMemo(
    () => ({ campaignId, filters, page, pageSize: PAGE_SIZE }),
    [campaignId, filters, page],
  );
  const queryKey = sheetQueryKey(query);

  useEffect(() => {
    if (!campaignId) return;
    return querySheet(query, setResult);
  }, [query, campaignId, revision]);

  // Debounced, and it resets paging: searching from page 4 would otherwise
  // land on an offset the narrowed result set doesn't reach.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const isCurrent = result?.key === queryKey;
  const loading = !isCurrent;
  const stats = result?.stats ?? null;
  const total = stats?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Edits are page-scoped: once the query changes, the old page's values
  // aren't on screen to keep.
  const applyFilters = useCallback((next: Partial<CampaignRowFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
    setPage(0);
    setEdits({});
    setSelected(new Set());
  }, []);

  const rows: CampaignRow[] = useMemo(
    () => (result?.rows ?? []).map((r) => ({ ...r, ...edits[r.rowId] })),
    [result, edits],
  );

  /* ─── Saving ───────────────────────────────────────────────────────── */

  const commit = useCallback(
    async (row: CampaignRow, patch: CampaignRowPatch) => {
      // Nothing changed — don't write, and don't flash a "saved" tick at
      // someone who just tabbed through a cell.
      const unchanged = (Object.keys(patch) as (keyof CampaignRowPatch)[]).every(
        (k) => (patch[k] ?? null) === (row[k] ?? null),
      );
      if (unchanged) return;

      setEdits((prev) => ({ ...prev, [row.rowId]: { ...prev[row.rowId], ...patch } }));
      setSaveState((prev) => ({ ...prev, [row.rowId]: "saving" }));
      try {
        await updateSheetRow(row.rowId, patch, actor);
        setSaveState((prev) => ({ ...prev, [row.rowId]: "saved" }));
        setTimeout(
          () => setSaveState((prev) => (prev[row.rowId] === "saved" ? { ...prev, [row.rowId]: "idle" } : prev)),
          1500,
        );
      } catch (err) {
        // The optimistic value stays on screen with an error marker rather
        // than silently reverting — losing what someone typed mid-call is
        // worse than showing it as unsaved.
        setSaveState((prev) => ({ ...prev, [row.rowId]: "error" }));
        setError(getErrorMessage(err, "Couldn't save that change"));
      }
    },
    [actor],
  );

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      !confirm(`Remove ${ids.length} row${ids.length !== 1 ? "s" : ""} from this campaign? The leads themselves stay.`)
    )
      return;
    setBusy(true);
    setError("");
    try {
      await removeSheetRows(ids);
      setSelected(new Set());
      setRevision((r) => r + 1);
      setNotice(`Removed ${ids.length} row${ids.length !== 1 ? "s" : ""}.`);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to remove those rows"));
    } finally {
      setBusy(false);
    }
  }

  async function renumber() {
    setBusy(true);
    setError("");
    try {
      const moved = await renumberCampaign(campaignId);
      setRevision((r) => r + 1);
      setNotice(moved === 0 ? "Numbering was already in order." : `Renumbered ${moved.toLocaleString()} rows.`);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to renumber"));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Exports the whole sheet, not just the page on screen — a 4,000-row
   * campaign exported as the visible 100 would be quietly wrong. Paged
   * through in 500s, which is the ceiling campaign_rows allows.
   */
  async function exportSheet() {
    setBusy(true);
    setError("");
    try {
      const all: CampaignRow[] = [];
      for (let p = 0; ; p++) {
        const batch = await fetchSheetRows({ campaignId, filters, page: p, pageSize: 500 });
        all.push(...batch);
        if (batch.length < 500 || all.length >= total) break;
      }
      exportToCsv(
        `${(campaign?.name ?? "campaign").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`,
        [
          "No.",
          "Company Name",
          "Contact",
          "Address1",
          "City",
          "State",
          "Zip",
          "Phone",
          "Email",
          "Category",
          "Source",
          "Call Date",
          "Attempts",
          "Call Outcome",
          "Caller Feedback / Prospect's Stated Problem",
          "Interested In (Service)",
          "Best Time",
          "Follow-Up Date",
          "Next Action",
          "Assigned Rep",
          "Do Not Call",
        ],
        all.map((r) => [
          r.position,
          r.companyName ?? "",
          r.contactName ?? "",
          r.address1 ?? "",
          r.city ?? "",
          r.state ?? "",
          r.zip ?? "",
          r.phone ?? "",
          r.email ?? "",
          r.category ?? "",
          r.source ?? "",
          r.callDate ?? "",
          r.attempts,
          r.callOutcome ?? "",
          r.callerFeedback ?? "",
          r.interestedIn ?? "",
          r.bestTime ?? "",
          r.followUpDate ?? "",
          r.nextAction ?? "",
          r.assignedRepName ?? "",
          r.doNotCall ? "Yes" : "",
        ]),
      );
      setNotice(`Exported ${all.length.toLocaleString()} rows.`);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to export"));
    } finally {
      setBusy(false);
    }
  }

  /* ─── Empty / missing states ───────────────────────────────────────── */

  if (!campaignsLoading && !campaign) {
    return (
      <div>
        <Header title="Campaign" subtitle="Not available" />
        <div className="bg-white border border-[#eaeaea] rounded-xl p-12 text-center">
          <p className="text-sm font-medium text-[#0a0a0a] mb-1">This campaign isn&apos;t available</p>
          <p className="text-xs text-[#999] mb-4">It may have been deleted, or you may not have been added to it.</p>
          <Link href="/leads" className="text-xs text-[#0070f3] hover:underline">
            Back to Leads
          </Link>
        </div>
      </div>
    );
  }

  const repOptions = employees.map((e) => ({ value: e.id, label: e.name }));

  return (
    <div>
      <Header
        title={campaign?.name ?? "Campaign"}
        subtitle={
          campaignsLoading
            ? "Loading…"
            : [
                `${total.toLocaleString()} row${total !== 1 ? "s" : ""}`,
                stats && `${stats.called.toLocaleString()} called`,
                stats &&
                  stats.followUps > 0 &&
                  `${stats.followUps.toLocaleString()} follow-up${stats.followUps !== 1 ? "s" : ""} due`,
                campaign?.myLevel === "viewer" && "read-only",
              ]
                .filter(Boolean)
                .join(" · ")
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/leads"
              className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[13px] font-medium text-[#444] px-3 py-2 rounded-md hover:bg-[#fafafa] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Leads
            </Link>
            <button
              onClick={exportSheet}
              disabled={busy || total === 0}
              className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[13px] font-medium text-[#444] px-3 py-2 rounded-md hover:bg-[#fafafa] transition-colors disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={renumber}
                  disabled={busy || total === 0}
                  className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[13px] font-medium text-[#444] px-3 py-2 rounded-md hover:bg-[#fafafa] transition-colors disabled:opacity-40"
                  title="Close gaps in the No. column"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Renumber</span>
                </button>
                <button
                  onClick={() => setShowAccess(true)}
                  className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[13px] font-medium text-[#444] px-3 py-2 rounded-md hover:bg-[#fafafa] transition-colors"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Access</span>
                </button>
              </>
            )}
            {canEdit && (
              <button
                onClick={() => setShowAddLeads(true)}
                className="flex items-center gap-1.5 bg-[#0a0a0a] text-white text-[13px] font-medium px-3.5 py-2 rounded-md hover:bg-[#333] transition-colors"
              >
                <Plus className="w-4 h-4" /> Add leads
              </button>
            )}
          </div>
        }
      />

      {campaign?.myLevel === "viewer" && (
        <div className="flex items-start gap-2 mb-4 px-4 py-2.5 rounded-lg bg-[#f1f1f1] text-[#666] text-sm">
          <Eye className="w-4 h-4 shrink-0 mt-0.5" />
          <p>You have read-only access to this campaign. You can read the sheet but not fill it in.</p>
        </div>
      )}

      {(error || result?.error) && (
        <div className="flex items-start justify-between gap-2 mb-4 px-4 py-2.5 rounded-lg bg-[#fef2f2] text-[#f31260] text-sm">
          <p>{error || result?.error}</p>
          {error && (
            <button onClick={() => setError("")} className="shrink-0 p-0.5 rounded hover:bg-[#fff0f3]">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      {notice && <div className="mb-4 px-4 py-2.5 rounded-lg bg-[#f0fdf4] text-[#17c964] text-sm">{notice}</div>}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-px bg-[#f4f4f4] border border-[#eaeaea] rounded-xl mb-4 overflow-hidden">
          {[
            { label: "Rows", value: stats.total },
            { label: "Called", value: stats.called },
            { label: "Interested", value: stats.interested },
            { label: "Follow-ups Due", value: stats.followUps },
            { label: "Do Not Call", value: stats.doNotCall },
          ].map((s) => (
            <div key={s.label} className="bg-white px-4 py-3">
              <p className="text-xl font-bold tabular-nums leading-none text-[#0a0a0a]">{s.value.toLocaleString()}</p>
              <p className="text-[10px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-[#eaeaea] rounded-xl">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#eaeaea]">
          <div className="relative flex-1 min-w-48 max-w-xs">
            <Search className="w-3.5 h-3.5 text-[#bbb] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search this sheet…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="text-sm border border-[#eaeaea] rounded-md pl-9 pr-3 py-1.5 w-full outline-none focus:border-[#0070f3] transition-colors"
            />
          </div>
          <button
            onClick={() => applyFilters({ uncalled: !filters.uncalled })}
            className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
              filters.uncalled
                ? "border-[#0a0a0a] bg-[#fafafa] text-[#0a0a0a]"
                : "border-[#eaeaea] text-[#666] hover:bg-[#fafafa]"
            }`}
          >
            Not called
          </button>
          <button
            onClick={() => applyFilters({ due: !filters.due })}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
              filters.due
                ? "border-[#f31260] bg-[#fef2f2] text-[#f31260]"
                : "border-[#eaeaea] text-[#666] hover:bg-[#fafafa]"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Follow-up due
          </button>
          <select
            value={filters.outcome}
            onChange={(e) => applyFilters({ outcome: e.target.value })}
            className="text-xs border border-[#eaeaea] rounded-md px-2 py-1.5 outline-none focus:border-[#0070f3] bg-white text-[#444]"
          >
            <option value="">Any outcome</option>
            {CALL_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select
            value={filters.rep}
            onChange={(e) => applyFilters({ rep: e.target.value })}
            className="text-xs border border-[#eaeaea] rounded-md px-2 py-1.5 outline-none focus:border-[#0070f3] bg-white text-[#444]"
          >
            <option value="">Any rep</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#999]" />}
          <div className="flex-1" />
          {canEdit && selected.size > 0 && (
            <button
              onClick={deleteSelected}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs font-medium border border-[#eaeaea] bg-white text-[#f31260] px-3 py-1.5 rounded-md hover:bg-[#fff0f3] transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove {selected.size}
            </button>
          )}
        </div>

        {loading && !result && (
          <div className="p-12 text-center">
            <Loader2 className="w-5 h-5 text-[#999] mx-auto mb-3 animate-spin" />
            <p className="text-sm text-[#999]">Loading sheet…</p>
          </div>
        )}

        {isCurrent && total === 0 && (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">Nothing on this sheet yet</p>
            <p className="text-xs text-[#999]">
              {canEdit
                ? "Add leads by filter, or select leads on the Leads tab and add them here."
                : "An administrator will add leads to this campaign."}
            </p>
          </div>
        )}

        {/* The sheet */}
        {rows.length > 0 && (
          <div className={`overflow-auto max-h-[70vh] transition-opacity ${loading ? "opacity-60" : ""}`}>
            <table className="border-collapse" style={{ minWidth: "1800px" }}>
              <thead className="sticky top-0 z-20">
                <tr className="bg-[#fafafa]">
                  {canEdit && (
                    <th className="sticky left-0 z-30 bg-[#fafafa] border-r border-b border-[#eaeaea] w-9 px-2 h-9" />
                  )}
                  <th
                    className={`sticky ${canEdit ? "left-9" : "left-0"} z-30 bg-[#fafafa] border-r border-b border-[#eaeaea] w-14 px-2 h-9 text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider`}
                  >
                    No.
                  </th>
                  <th
                    className={`sticky ${canEdit ? "left-23" : "left-14"} z-30 bg-[#fafafa] border-r border-b border-[#eaeaea] px-2 h-9 text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider min-w-52`}
                  >
                    Company Name
                  </th>
                  {[
                    "Contact",
                    "Address1",
                    "City",
                    "State",
                    "Zip",
                    "Phone",
                    "Email",
                    "Category",
                    "Source",
                    "Call Date",
                    "Attempts",
                    "Call Outcome",
                    "Caller Feedback / Prospect's Stated Problem",
                    "Interested In (Service)",
                    "Best Time",
                    "Follow-Up Date",
                    "Next Action",
                    "Assigned Rep",
                    "DNC",
                  ].map((h) => (
                    <th
                      key={h}
                      className="bg-[#fafafa] border-r border-b border-[#eaeaea] px-2 h-9 text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                  <th className="bg-[#fafafa] border-b border-[#eaeaea] w-8 px-2 h-9" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const state = saveState[row.rowId] ?? "idle";
                  const dueSoon =
                    row.followUpDate !== null && row.followUpDate <= new Date().toISOString().slice(0, 10);
                  return (
                    <tr
                      key={row.rowId}
                      className={`group ${row.doNotCall ? "bg-[#fef2f2]" : "hover:bg-[#fafafa]"} transition-colors`}
                    >
                      {canEdit && (
                        <td
                          className={`sticky left-0 z-10 ${row.doNotCall ? "bg-[#fef2f2]" : "bg-white group-hover:bg-[#fafafa]"} ${CELL} border-[#eaeaea]`}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(row.rowId)}
                            onChange={() =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(row.rowId)) next.delete(row.rowId);
                                else next.add(row.rowId);
                                return next;
                              })
                            }
                            aria-label={`Select row ${row.position}`}
                            className="w-3 h-3 accent-[#0a0a0a] cursor-pointer"
                          />
                        </td>
                      )}
                      <td
                        className={`sticky ${canEdit ? "left-9" : "left-0"} z-10 ${row.doNotCall ? "bg-[#fef2f2]" : "bg-white group-hover:bg-[#fafafa]"} ${CELL} border-[#eaeaea] text-[11px] text-[#999] tabular-nums`}
                      >
                        {row.position}
                      </td>
                      <td
                        className={`sticky ${canEdit ? "left-23" : "left-14"} z-10 ${row.doNotCall ? "bg-[#fef2f2]" : "bg-white group-hover:bg-[#fafafa]"} ${CELL} border-[#eaeaea] min-w-52`}
                      >
                        <div className="flex items-center gap-1">
                          <span className="text-[12px] font-medium text-[#0a0a0a] whitespace-nowrap truncate">
                            {row.companyName ?? "—"}
                          </span>
                          <CopyButton value={row.companyName ?? ""} label="company name" revealOnHover />
                        </div>
                      </td>

                      {/* Lead facts: read-only here on purpose. They belong to
                          the lead, and a campaign grant gives sight of the
                          lead, not permission to rewrite it — edit those on
                          the lead itself. */}
                      <td className={READ_CELL}>
                        <div className="flex items-center gap-1">
                          <span className="truncate">{row.contactName ?? ""}</span>
                          <CopyButton value={row.contactName ?? ""} label="contact name" revealOnHover />
                        </div>
                      </td>
                      <td className={READ_CELL}>{row.address1 ?? ""}</td>
                      <td className={READ_CELL}>{row.city ?? ""}</td>
                      <td className={READ_CELL}>{row.state ?? ""}</td>
                      <td className={READ_CELL}>{row.zip ?? ""}</td>
                      <td className={`${CELL} text-[12px] whitespace-nowrap`}>
                        {row.phone ? (
                          <div className="flex items-center gap-1">
                            <a href={telHref(row.phone)} className="text-[#0070f3] hover:underline font-mono">
                              {formatPhone(row.phone)}
                            </a>
                            <CopyButton value={formatPhone(row.phone)} label="phone number" revealOnHover />
                          </div>
                        ) : (
                          <span className="text-[#ccc]">—</span>
                        )}
                      </td>
                      <td className={`${CELL} text-[12px] whitespace-nowrap`}>
                        {row.email ? (
                          <div className="flex items-center gap-1">
                            <a
                              href={`mailto:${row.email}`}
                              className="text-[#0070f3] hover:underline truncate max-w-44"
                            >
                              {row.email}
                            </a>
                            <CopyButton value={row.email} label="email address" revealOnHover />
                          </div>
                        ) : (
                          <span className="text-[#ccc]">—</span>
                        )}
                      </td>
                      <td className={READ_CELL}>{row.category ?? ""}</td>
                      <td className={READ_CELL}>{row.source ?? ""}</td>

                      {/* Call results: the editable half of the sheet. */}
                      <td className={CELL}>
                        <input
                          type="date"
                          defaultValue={row.callDate ?? ""}
                          key={`cd-${row.rowId}-${row.callDate ?? ""}`}
                          disabled={!canEdit}
                          onBlur={(e) => commit(row, { callDate: e.target.value || null })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          className={`${INPUT} w-32`}
                        />
                      </td>
                      <td className={CELL}>
                        <input
                          type="text"
                          inputMode="numeric"
                          defaultValue={row.attempts ? String(row.attempts) : ""}
                          key={`at-${row.rowId}-${row.attempts}`}
                          disabled={!canEdit}
                          onBlur={(e) => commit(row, { attempts: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          className={`${INPUT} w-14 tabular-nums`}
                        />
                      </td>
                      <td className={CELL}>
                        <select
                          value={row.callOutcome ?? ""}
                          disabled={!canEdit}
                          onChange={(e) => commit(row, { callOutcome: e.target.value || null })}
                          className={`${INPUT} w-40 ${row.callOutcome ? (CALL_OUTCOME_STYLES[row.callOutcome] ?? "") : ""} rounded`}
                        >
                          <option value="">—</option>
                          {/* A value saved before this list changed still
                              needs to be selectable, or opening the row would
                              silently blank it. */}
                          {row.callOutcome &&
                            !CALL_OUTCOMES.includes(row.callOutcome as (typeof CALL_OUTCOMES)[number]) && (
                              <option value={row.callOutcome}>{row.callOutcome}</option>
                            )}
                          {CALL_OUTCOMES.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={CELL}>
                        <input
                          type="text"
                          defaultValue={row.callerFeedback ?? ""}
                          key={`fb-${row.rowId}-${row.callerFeedback ?? ""}`}
                          disabled={!canEdit}
                          placeholder={canEdit ? "What they said…" : ""}
                          onBlur={(e) => commit(row, { callerFeedback: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          className={`${INPUT} w-80`}
                        />
                      </td>
                      <td className={CELL}>
                        <input
                          type="text"
                          list="campaign-services"
                          defaultValue={row.interestedIn ?? ""}
                          key={`in-${row.rowId}-${row.interestedIn ?? ""}`}
                          disabled={!canEdit}
                          onBlur={(e) => commit(row, { interestedIn: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          className={`${INPUT} w-44`}
                        />
                      </td>
                      <td className={CELL}>
                        <input
                          type="text"
                          defaultValue={row.bestTime ?? ""}
                          key={`bt-${row.rowId}-${row.bestTime ?? ""}`}
                          disabled={!canEdit}
                          placeholder={canEdit ? "e.g. after 4pm" : ""}
                          onBlur={(e) => commit(row, { bestTime: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          className={`${INPUT} w-32`}
                        />
                      </td>
                      <td className={`${CELL} ${dueSoon ? "bg-[#fef2f2]" : ""}`}>
                        <input
                          type="date"
                          defaultValue={row.followUpDate ?? ""}
                          key={`fu-${row.rowId}-${row.followUpDate ?? ""}`}
                          disabled={!canEdit}
                          onBlur={(e) => commit(row, { followUpDate: e.target.value || null })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          className={`${INPUT} w-32 ${dueSoon ? "text-[#f31260] font-medium" : ""}`}
                        />
                      </td>
                      <td className={CELL}>
                        <input
                          type="text"
                          defaultValue={row.nextAction ?? ""}
                          key={`na-${row.rowId}-${row.nextAction ?? ""}`}
                          disabled={!canEdit}
                          placeholder={canEdit ? "Next step…" : ""}
                          onBlur={(e) => commit(row, { nextAction: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          className={`${INPUT} w-52`}
                        />
                      </td>
                      <td className={CELL}>
                        <select
                          value={row.assignedRep ?? ""}
                          disabled={!canEdit}
                          onChange={(e) => {
                            const id = e.target.value;
                            commit(row, {
                              assignedRep: id || null,
                              // Denormalised so the sheet and its export read
                              // a name without joining employees per row.
                              assignedRepName: repOptions.find((r) => r.value === id)?.label ?? null,
                            });
                          }}
                          className={`${INPUT} w-36`}
                        >
                          <option value="">Unassigned</option>
                          {repOptions.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={`${CELL} text-center`}>
                        <input
                          type="checkbox"
                          checked={row.doNotCall}
                          disabled={!canEdit}
                          onChange={(e) => commit(row, { doNotCall: e.target.checked })}
                          aria-label="Do not call"
                          className="w-3 h-3 accent-[#f31260] cursor-pointer"
                        />
                      </td>
                      <td className="border-b border-[#f0f0f0] w-8 px-1 text-center">
                        {state === "saving" && <Loader2 className="w-3 h-3 animate-spin text-[#bbb] inline" />}
                        {state === "saved" && <Check className="w-3 h-3 text-[#17c964] inline" />}
                        {state === "error" && (
                          <span title="Not saved — check the error above">
                            <AlertTriangle className="w-3 h-3 text-[#f31260] inline" />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Suggestions for "Interested In", shared by every row's input. */}
            <datalist id="campaign-services">
              {SERVICE_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        )}

        {/* Paging */}
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-[#eaeaea]">
            <p className="text-xs text-[#999] tabular-nums">
              {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, total).toLocaleString()} of{" "}
              {total.toLocaleString()}
              {canEdit && <span className="hidden sm:inline"> · changes save as you go</span>}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setPage((p) => Math.max(0, p - 1));
                  setEdits({});
                }}
                disabled={page === 0 || loading}
                className="flex items-center gap-1 text-xs font-medium border border-[#eaeaea] bg-white text-[#444] px-2.5 py-1.5 rounded-md hover:bg-[#fafafa] transition-colors disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <span className="text-xs text-[#666] tabular-nums px-1">
                {(page + 1).toLocaleString()} / {pageCount.toLocaleString()}
              </span>
              <button
                onClick={() => {
                  setPage((p) => Math.min(pageCount - 1, p + 1));
                  setEdits({});
                }}
                disabled={page >= pageCount - 1 || loading}
                className="flex items-center gap-1 text-xs font-medium border border-[#eaeaea] bg-white text-[#444] px-2.5 py-1.5 rounded-md hover:bg-[#fafafa] transition-colors disabled:opacity-40"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {showAccess && campaign && isAdmin && (
        <CampaignAccessModal campaign={campaign} actor={actor} onClose={() => setShowAccess(false)} />
      )}
      {showAddLeads && campaign && canEdit && (
        <AddLeadsToSheetModal
          campaignId={campaign.id}
          campaignName={campaign.name}
          onClose={() => setShowAddLeads(false)}
          onAdded={(message) => {
            setNotice(message);
            setRevision((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
