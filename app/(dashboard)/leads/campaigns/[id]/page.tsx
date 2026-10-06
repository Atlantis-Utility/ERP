"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useConfirm } from "@/lib/confirm";
import { useToast } from "@/lib/toast";
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
  Columns3,
  Lock,
  ChevronLeft,
  ChevronRight,
  Eye,
  ClipboardCheck,
  Phone,
  Mail,
} from "lucide-react";
import Header from "@/components/layout/Header";
import CopyButton from "@/components/ui/CopyButton";
import Select from "@/components/ui/Select";
import DateTimePicker from "@/components/ui/DateTimePicker";
import CampaignAccessModal from "@/components/campaigns/CampaignAccessModal";
import AddLeadsToSheetModal from "@/components/campaigns/AddLeadsToSheetModal";
import SheetColumnsModal from "@/components/campaigns/SheetColumnsModal";
import ReviewChangesModal from "@/components/campaigns/ReviewChangesModal";
import { useEmployees } from "@/lib/db/employees";
import { useLeadsAccess } from "@/lib/leads-access";
import {
  useCampaigns,
  useCampaignGrants,
  querySheet,
  sheetQueryKey,
  updateSheetRow,
  removeSheetRows,
  assignSheetRows,
  colorSheetRows,
  setCampaignMeta,
  fetchSheetRowIds,
  renumberCampaign,
  fetchSheetRows,
  EMPTY_ROW_FILTERS,
  type CampaignRow,
  type CampaignRowPatch,
  type CampaignRowFilters,
  type SheetResult,
  type SheetQuery,
} from "@/lib/db/campaigns";
import {
  CALL_OUTCOME_OPTIONS,
  CALL_OUTCOME_STYLES,
  SERVICE_OPTIONS,
  BEST_TIME_OPTIONS,
  CHECK_COL_WIDTH,
  sheetColumnsFor,
  hiddenColumns,
  columnLabel,
  paletteBg,
  ROW_COLOR_KEY,
  SWATCH_BY_ID,
  SWATCHES,
  type SheetColumnDef,
} from "@/lib/campaign-constants";
import {
  requestLeadChange,
  changesError,
  LEAD_FIELD_LABELS,
  type EditableLeadField,
} from "@/lib/db/lead-changes";
import { exportToCsv } from "@/lib/export";
import { getErrorMessage, formatPhone, telHref, emailAddress } from "@/lib/utils";

const PAGE_SIZE = 100;

// The bulk rep menu's "nobody" entry. Not "", which the Select reads as
// nothing picked.
const UNASSIGN = "__unassign__";
/** The colour menu's "take the colour off" entry. */
const CLEAR_COLOR = "__clear";

// Shared cell chrome. A spreadsheet reads as a grid, so every cell is the
// same height with a hairline border and no rounded corners: the editable
// ones only differ by being focusable.
const CELL = "border-r border-b border-[#f0f0f0] px-2 h-9 align-middle";

/**
 * Every column's width in pixels, in the order they appear.
 *
 * Declared rather than left to the browser, because two things need them
 * exactly. The table is laid out `table-fixed`, so these are obeyed instead
 * of being treated as hints and squeezed to fit the viewport, which is what
 * clipped every cell to a few characters. And the frozen pane's sticky
 * offsets are the running total of the columns to its left: while those were
 * hard-coded (left-9, left-23) against widths the browser was free to
 * ignore, a narrower render left a gap between two pinned cells, and the
 * columns scrolling underneath showed through it.
 *
 * A call sheet is wide. That's what the horizontal scrollbar is for.
 */
/**
 * In render order, and the same list the headings and the rename dialog
 * read, so the <colgroup>, the header and what a campaign calls its columns
 * can't disagree (lib/campaign-constants).
 */
function sheetColumnWidths(canEdit: boolean, columns: SheetColumnDef[]): number[] {
  return [...(canEdit ? [CHECK_COL_WIDTH] : []), ...columns.map((c) => c.width)];
}

/**
 * Where each pinned column sits: the sum of the widths before it. Applied as
 * a style rather than a Tailwind class so it is always the real number.
 */
function pinOffsets(canEdit: boolean, columns: SheetColumnDef[]) {
  const check = canEdit ? CHECK_COL_WIDTH : 0;
  return { check: 0, no: check, company: check + (columns[0]?.width ?? 0) };
}

// An opaque background stops the scrolling columns showing through the pane,
// and the shadow gives its last column a hard edge: without one, a column
// caught half-scrolled sits flush against the company name and the two read
// as overlapping text.
const PIN_EDGE = "shadow-[6px_0_8px_-6px_rgba(0,0,0,0.13)]";
const INPUT =
  "w-full h-full bg-transparent text-[12px] text-[#0a0a0a] px-1 outline-none focus:bg-[#eff6ff] transition-colors";
// A cell holding a correction that hasn't been reviewed. Amber, the same
// "waiting on someone" colour the rest of the app uses, rather than red:
// nothing is wrong, it just isn't final.
const PENDING_CELL = "bg-[#fefce8]";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Which lead fact each sheet column shows. The sheet's own columns are named
 * for the spreadsheet ("Address1", "Category"), while a change request names
 * the lead field it would rewrite, so the two have to be mapped.
 */
const FACT_COLUMNS = {
  companyName: "companyName",
  contactName: "pocName",
  address1: "street",
  city: "city",
  state: "state",
  zip: "zip",
  phone: "phone",
  email: "email",
  category: "businessType",
} as const satisfies Record<string, EditableLeadField>;

type FactColumn = keyof typeof FACT_COLUMNS;

/** The sheet column each lead fact is shown in, for colouring and renaming. */
const FACT_COLUMN_KEYS: Record<FactColumn, string> = {
  companyName: "company",
  contactName: "contact",
  address1: "address1",
  city: "city",
  state: "state",
  zip: "zip",
  phone: "phone",
  email: "email",
  category: "category",
};

/** A correction typed into the sheet, before the page is refetched. */
interface LocalFact {
  value: string;
  /** False once an administrator's own edit has gone straight to the lead. */
  pending: boolean;
}

export default function CampaignSheetPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params?.id ?? "";

  const employees = useEmployees();
  const access = useLeadsAccess();
  const { campaigns, loading: campaignsLoading } = useCampaigns();
  // Who this campaign was handed to, which is who its rows can be assigned to.
  const grants = useCampaignGrants(campaignId);
  const confirm = useConfirm();

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

  // Corrections typed in this session, rowId -> lead field -> value, applied
  // over what the server sent so a cell keeps what was typed until the next
  // fetch (the same job `edits` does for the call columns).
  const [localFacts, setLocalFacts] = useState<Record<string, Record<string, LocalFact>>>({});

  const [showAccess, setShowAccess] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showAddLeads, setShowAddLeads] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  /** Where the colour menu is open, and on what. */
  const [paint, setPaint] = useState<{ x: number; y: number; row: CampaignRow; key: string } | null>(null);
  /** A colour being made from the paint menu, before it exists. */
  const [newColor, setNewColor] = useState<{ name: string; swatch: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { success, error: notifyError } = useToast();

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

  const pageFullySelected = rows.length > 0 && rows.every((r) => selected.has(r.rowId));

  // This campaign's columns: the built-in ones under whatever it calls
  // them, plus any it has added itself.
  const columnDefs = useMemo(() => sheetColumnsFor(campaign?.columns), [campaign?.columns]);
  const extraColumns = campaign?.columns.extra ?? [];
  // Columns this campaign has put away. Their cells aren't rendered at all,
  // so a row stays in step with the headings; what is stored in them is
  // untouched, and comes back if the column does.
  const hidden = useMemo(() => hiddenColumns(campaign?.columns), [campaign?.columns]);
  const shows = (key: string) => !hidden.has(key);
  const palette = useMemo(() => campaign?.columns.palette ?? [], [campaign?.columns]);

  /**
   * A cell's tint: its own colour if it has one, otherwise the row's. The
   * row colour is the broad stroke ("this lot are the parent company") and
   * a cell colour is the exception on top of it.
   */
  function cellClass(row: CampaignRow, key: string, extra = "") {
    const tint = paletteBg(palette, row.colors?.[key] ?? row.colors?.[ROW_COLOR_KEY]);
    return `${CELL} ${extra} ${tint}`.trim();
  }
  const columnWidths = sheetColumnWidths(canEdit, columnDefs);
  const pins = pinOffsets(canEdit, columnDefs);

  /* ─── Saving ───────────────────────────────────────────────────────── */

  const commit = useCallback(
    async (row: CampaignRow, patch: CampaignRowPatch) => {
      // Nothing changed: don't write, and don't flash a "saved" tick at
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
        // than silently reverting: losing what someone typed mid-call is
        // worse than showing it as unsaved.
        setSaveState((prev) => ({ ...prev, [row.rowId]: "error" }));
        const message = getErrorMessage(err, "Couldn't save that change");
        // The colours column arrives with migration-campaign-colors.sql.
        // Without it the database says "column does not exist", which is
        // not a useful thing to read halfway through a call.
        notifyError(
          "colors" in patch && /colors/i.test(message)
            ? "Colours need supabase/migration-campaign-colors.sql run on the database."
            : message,
        );
      }
    },
    [actor, notifyError],
  );

  // A queued correction changes the pending count the Review button reads,
  // and that count comes from the server. Refetched on a short delay rather
  // than per cell, so typing across a row is one refresh at the end of it.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setRevision((r) => r + 1), 1500);
  }, []);

  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  /**
   * What a lead-fact cell should show, and whether it's waiting on a review.
   *
   * Three sources, in order: something typed here in this session, a
   * correction someone else has outstanding (campaign_rows sends those), and
   * finally what's actually stored on the lead.
   */
  const factCell = useCallback(
    (row: CampaignRow, column: FactColumn): { value: string; pending: boolean } => {
      const field = FACT_COLUMNS[column];
      const local = localFacts[row.rowId]?.[field];
      if (local) return { value: local.value, pending: local.pending };
      const proposed = row.pending?.[field];
      if (proposed !== undefined && proposed !== null) return { value: proposed, pending: true };
      return { value: (row[column] as string | null) ?? "", pending: false };
    },
    [localFacts],
  );

  /**
   * Sends a correction to a lead fact. An editor's goes to the review queue;
   * an administrator's is written straight through, because they are the
   * reviewer. Either way the cell keeps the new text.
   */
  const submitFact = useCallback(
    async (row: CampaignRow, column: FactColumn, raw: string) => {
      const field = FACT_COLUMNS[column];
      const next = raw.trim();
      const current = factCell(row, column);
      if (next === current.value.trim()) return;

      setSaveState((prev) => ({ ...prev, [row.rowId]: "saving" }));
      try {
        const outcome = await requestLeadChange(campaignId, row.leadId, field, next);
        setLocalFacts((prev) => {
          const forRow = { ...(prev[row.rowId] ?? {}) };
          if (outcome === "unchanged") delete forRow[field];
          else forRow[field] = { value: next, pending: outcome === "pending" };
          return { ...prev, [row.rowId]: forRow };
        });
        setSaveState((prev) => ({ ...prev, [row.rowId]: "saved" }));
        setTimeout(
          () => setSaveState((prev) => (prev[row.rowId] === "saved" ? { ...prev, [row.rowId]: "idle" } : prev)),
          1500,
        );
        if (outcome === "pending") {
          success(`${LEAD_FIELD_LABELS[field]} change sent for review.`);
          scheduleRefresh();
        }
      } catch (err) {
        setSaveState((prev) => ({ ...prev, [row.rowId]: "error" }));
        notifyError(changesError(err, "Couldn't send that correction"));
      }
    },
    [campaignId, factCell, scheduleRefresh, success, notifyError],
  );

  /**
   * One editable lead-fact cell. A function rather than a component so the
   * uncontrolled input keeps its identity while typing, the same way the
   * call columns work.
   */
  function factTd(row: CampaignRow, column: FactColumn, extra?: (value: string) => ReactNode) {
    const cell = factCell(row, column);
    const key = FACT_COLUMN_KEYS[column];
    return (
      <td
        className={cellClass(row, key, cell.pending ? PENDING_CELL : "")}
        onContextMenu={(e) => openPaint(e, row, key)}
      >
        <div className="flex items-center gap-1">
          <input
            type="text"
            defaultValue={cell.value}
            key={`${column}-${row.rowId}-${cell.value}`}
            disabled={!canEdit || row.doNotCall}
            onBlur={(e) => submitFact(row, column, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            title={cell.pending ? `Waiting on an administrator: ${cell.value}` : cell.value}
            className={`${INPUT} min-w-0 flex-1 ${cell.pending ? "text-[#946c00]" : ""}`}
          />
          {extra?.(cell.value)}
        </div>
      </td>
    );
  }

  /** True when any cell on the row is waiting on a reviewer. */
  const rowHasPending = useCallback(
    (row: CampaignRow) =>
      (Object.keys(FACT_COLUMNS) as FactColumn[]).some((column) => factCell(row, column).pending),
    [factCell],
  );

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `Remove ${ids.length} row${ids.length !== 1 ? "s" : ""} from this campaign?`,
      description: "They come off this sheet along with anything filled in on them. The leads themselves stay.",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeSheetRows(ids);
      setSelected(new Set());
      setRevision((r) => r + 1);
      success(`Removed ${ids.length} row${ids.length !== 1 ? "s" : ""}.`);
    } catch (err) {
      notifyError(getErrorMessage(err, "Failed to remove those rows"));
    } finally {
      setBusy(false);
    }
  }

  async function renumber() {
    setBusy(true);
    try {
      const moved = await renumberCampaign(campaignId);
      setRevision((r) => r + 1);
      success(moved === 0 ? "Numbering was already in order." : `Renumbered ${moved.toLocaleString()} rows.`);
    } catch (err) {
      notifyError(getErrorMessage(err, "Failed to renumber"));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Exports the whole sheet, not just the page on screen: a 4,000-row
   * campaign exported as the visible 100 would be quietly wrong. Paged
   * through in 500s, which is the ceiling campaign_rows allows.
   */
  async function exportSheet() {
    setBusy(true);
    try {
      const all: CampaignRow[] = [];
      for (let p = 0; ; p++) {
        const batch = await fetchSheetRows({ campaignId, filters, page: p, pageSize: 500 });
        all.push(...batch);
        if (batch.length < 500 || all.length >= total) break;
      }
      // The same columns the sheet shows, under the same headings: an
      // export that doesn't match what you were looking at is a puzzle.
      const value: Record<string, (r: CampaignRow) => string | number> = {
        no: (r) => r.position,
        company: (r) => r.companyName ?? "",
        address1: (r) => r.address1 ?? "",
        city: (r) => r.city ?? "",
        state: (r) => r.state ?? "",
        zip: (r) => r.zip ?? "",
        category: (r) => r.category ?? "",
        phone: (r) => r.phone ?? "",
        email: (r) => r.email ?? "",
        contact: (r) => r.contactName ?? "",
        callDate: (r) => r.callDate ?? "",
        attempts: (r) => r.attempts,
        outcome: (r) => r.callOutcome ?? "",
        feedback: (r) => r.callerFeedback ?? "",
        interested: (r) => r.interestedIn ?? "",
        bestTime: (r) => r.bestTime ?? "",
        followUp: (r) => r.followUpDate ?? "",
        nextAction: (r) => r.nextAction ?? "",
        rep: (r) => r.assignedRepName ?? "",
        dnc: (r) => (r.doNotCall ? "Yes" : ""),
        notes: (r) => r.notes ?? "",
      };
      exportToCsv(
        `${(campaign?.name ?? "campaign").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`,
        columnDefs.map((c) => c.label),
        all.map((r) =>
          columnDefs.map((c) =>
            c.key.startsWith("x:") ? (r.extra[c.key.slice(2)] ?? "") : (value[c.key]?.(r) ?? ""),
          ),
        ),
      );
      success(`Exported ${all.length.toLocaleString()} rows.`);
    } catch (err) {
      notifyError(getErrorMessage(err, "Failed to export"));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Who a row on this sheet can be assigned to: the people the campaign was
   * given edit access to, not the whole staff list. Assigning a row to
   * someone who can't open the sheet makes a row nobody works, and a picker
   * of forty names for a campaign two people share is just noise.
   *
   * Viewers are left out for the same reason, they can read the sheet but
   * not fill anything in. Anyone already named on a row stays in the list
   * even if their access has since been revoked, so their cells keep showing
   * a name instead of going blank.
   */
  const repOptions = useMemo(() => {
    const nameById = new Map(employees.map((e) => [e.id, e.name]));
    const options = grants
      .filter((g) => g.level === "editor")
      .map((g) => ({ value: g.employeeId, label: nameById.get(g.employeeId) ?? g.employeeId }));

    const seen = new Set(options.map((o) => o.value));
    for (const row of rows) {
      if (row.assignedRep && !seen.has(row.assignedRep)) {
        seen.add(row.assignedRep);
        options.push({
          value: row.assignedRep,
          label: row.assignedRepName ?? nameById.get(row.assignedRep) ?? row.assignedRep,
        });
      }
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [grants, employees, rows]);

  /**
   * Bulk assign. Handing a campaign to a second editor leaves every row in
   * the first editor's name (campaign_fill_assigned_rep fills the blanks),
   * and the only fix the sheet offered was the dropdown on each of 250
   * rows. The rep filter above narrows to whoever is wrongly named, select
   * all takes the lot, and this moves them in one go.
   */
  async function assignSelected(repId: string) {
    const ids = [...selected];
    if (ids.length === 0 || !repId) return;
    const rep =
      repId === UNASSIGN
        ? null
        : { id: repId, name: repOptions.find((r) => r.value === repId)?.label ?? repId };
    const many = `${ids.length} row${ids.length !== 1 ? "s" : ""}`;
    const ok = await confirm({
      title: rep ? `Assign ${many} to ${rep.name}?` : `Clear the rep on ${many}?`,
      description: "Whoever is named on those rows now is replaced.",
      confirmLabel: rep ? "Assign" : "Clear",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await assignSheetRows(ids, rep, actor);
      setSelected(new Set());
      setRevision((r) => r + 1);
      success(rep ? `Assigned ${many} to ${rep.name}.` : `Cleared the rep on ${many}.`);
    } catch (err) {
      notifyError(getErrorMessage(err, "Failed to reassign those rows"));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Right-clicking a cell offers this campaign's colours. Right-click
   * rather than a control in every cell: the sheet is already a grid of
   * inputs, and a swatch button in each of twenty columns would be louder
   * than the data.
   */
  function openPaint(e: React.MouseEvent, row: CampaignRow, key: string) {
    // Opens even when this campaign has no colours yet: a right-click that
    // silently does nothing is indistinguishable from a broken one, so the
    // menu opens and offers to go and make some. Colouring is allowed on a
    // do-not-call row too — a colour is a note to yourself about the row,
    // not an edit to the contact.
    if (!canEdit) return;
    e.preventDefault();
    setPaint({ x: e.clientX, y: e.clientY, row, key });
  }

  async function applyPaint(colorId: string | null) {
    if (!paint) return;
    const { row, key } = paint;
    setPaint(null);
    const colors = { ...row.colors };
    if (colorId) colors[key] = colorId;
    else delete colors[key];
    await commit(row, { colors });
  }

  /**
   * A colour made where it's wanted. Naming a colour is part of using one —
   * the legend is the whole point — so the menu that paints a cell is also
   * the place to make the colour, rather than sending somebody to a dialog
   * and back. Editing and removing them stays in Columns.
   */
  function startNewColor() {
    const taken = new Set(palette.map((c) => c.swatch));
    setNewColor({ name: "", swatch: (SWATCHES.find((sw) => !taken.has(sw.id)) ?? SWATCHES[0]).id });
  }

  async function addColorAndApply() {
    const name = newColor?.name.trim();
    if (!paint || !newColor || !name) return;
    const color = { id: `k${Date.now().toString(36)}`, name, swatch: newColor.swatch };
    const { row, key } = paint;
    setPaint(null);
    setNewColor(null);
    try {
      await setCampaignMeta(campaignId, {
        columns: { ...(campaign?.columns ?? {}), palette: [...palette, color] },
      });
    } catch (err) {
      notifyError(getErrorMessage(err, "Couldn't add that colour"));
      return;
    }
    await commit(row, { colors: { ...row.colors, [key]: color.id } });
  }

  /** The same colour across every selected row. */
  async function colorSelected(colorId: string) {
    const ids = [...selected];
    if (ids.length === 0 || !colorId) return;
    setBusy(true);
    try {
      await colorSheetRows(ids, colorId === CLEAR_COLOR ? null : colorId);
      setSelected(new Set());
      setRevision((r) => r + 1);
      const named = palette.find((c) => c.id === colorId)?.name;
      success(named ? `Coloured ${ids.length} row${ids.length === 1 ? "" : "s"} ${named}.` : `Cleared the colour on ${ids.length}.`);
    } catch (err) {
      notifyError(getErrorMessage(err, "Failed to colour those rows"));
    } finally {
      setBusy(false);
    }
  }

  /** Turning the flag off is the one edit a do-not-call row still takes. */
  async function unlockRow(row: CampaignRow) {
    const ok = await confirm({
      title: `Turn off do not call for ${row.companyName ?? "this row"}?`,
      description: "The row becomes editable again, and stops being counted as do-not-call.",
      confirmLabel: "Turn off",
    });
    if (!ok) return;
    await commit(row, { doNotCall: false });
  }

  /** Every row the filters match, not just the hundred on screen. */
  async function selectAllMatching() {
    setBusy(true);
    try {
      setSelected(new Set(await fetchSheetRowIds(campaignId, filters)));
    } catch (err) {
      notifyError(getErrorMessage(err, "Failed to select the whole sheet"));
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

  // The column model, and where the frozen pane's cells sit within it. Both
  // come from the same numbers, so the pane can't drift out of alignment
  // with the columns it's pinned over.

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
            {/* Back to the campaign list, not the full lead list: that's
                where this sheet was opened from. */}
            <Link
              href="/leads/campaigns"
              className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[13px] font-medium text-[#444] px-3 py-2 rounded-md hover:bg-[#fafafa] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Campaigns
            </Link>
            <button
              onClick={exportSheet}
              disabled={busy || total === 0}
              className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[13px] font-medium text-[#444] px-3 py-2 rounded-md hover:bg-[#fafafa] transition-colors disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
            {isAdmin && (stats?.pending ?? 0) > 0 && (
              <button
                onClick={() => setShowReview(true)}
                className="flex items-center gap-1.5 border border-[#f5a524] bg-[#fefce8] text-[13px] font-medium text-[#946c00] px-3 py-2 rounded-md hover:bg-[#fdf6d8] transition-colors"
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                Review {stats?.pending.toLocaleString()}
              </button>
            )}
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
                onClick={() => setShowColumns(true)}
                className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[13px] font-medium text-[#444] px-3 py-2 rounded-md hover:bg-[#fafafa] transition-colors"
                title="Rename this campaign, rename a heading, or add a column"
              >
                <Columns3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Columns</span>
              </button>
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

      {/* A page that couldn't load its rows is a state you need to keep
          reading, not an event, so it stays here. Everything that happens
          because of an action is a toast. */}
      {result?.error && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-[#fef2f2] text-[#f31260] text-sm">{result?.error}</div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-px bg-[#f4f4f4] border border-[#eaeaea] rounded-xl mb-4 overflow-hidden">
          {[
            { label: "Rows", value: stats.total },
            { label: "Called", value: stats.called },
            { label: "Interested", value: stats.interested },
            { label: "Follow-ups Due", value: stats.followUps },
            // Only worth a column when there's something in it, and only to
            // the person who can act on it.
            ...(isAdmin && stats.pending > 0
              ? [{ label: "Awaiting Review", value: stats.pending }]
              : [{ label: "Do Not Call", value: stats.doNotCall }]),
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
          {/* Search anchored left, filters anchored right, with the spacer
              between them doing the pushing: a filter bar that drifts with
              the width of whatever is beside it is hard to aim at. */}
          <div className="relative w-full sm:w-72 shrink-0">
            <Search className="w-3.5 h-3.5 text-[#bbb] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search this sheet…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="text-sm border border-[#eaeaea] rounded-md pl-9 pr-3 py-1.5 w-full outline-none focus:border-[#0070f3] transition-colors"
            />
          </div>

          {/* Acting on a selection, so it belongs with the search rather than
              in among the filters, which stay put. */}
          {canEdit && selected.size > 0 && (
            <>
              {/* Only an administrator can move work between people, which is
                  what campaign_leads_guard_rep enforces; the control is only
                  offered to someone it wouldn't refuse. */}
              {isAdmin && (
                <div className="w-44">
                  <Select
                    value=""
                    onChange={assignSelected}
                    placeholder={`Assign ${selected.size}…`}
                    options={[{ value: UNASSIGN, label: "Unassigned" }, ...repOptions]}
                    searchable
                  />
                </div>
              )}
              {palette.length > 0 && (
                <div className="w-40">
                  <Select
                    value=""
                    onChange={colorSelected}
                    placeholder={`Colour ${selected.size}…`}
                    options={[
                      ...palette.map((c) => ({ value: c.id, label: c.name })),
                      { value: CLEAR_COLOR, label: "No colour" },
                    ]}
                  />
                </div>
              )}
              {/* The page is fully ticked but the sheet is longer than the
                  page, which is the one moment "and the rest" is useful. */}
              {pageFullySelected && selected.size < total && (
                <button
                  onClick={selectAllMatching}
                  disabled={busy}
                  className="text-xs font-medium border border-[#eaeaea] bg-white text-[#0070f3] px-3 py-1.5 rounded-md hover:bg-[#f5faff] transition-colors disabled:opacity-50"
                >
                  Select all {total.toLocaleString()}
                </button>
              )}
              <button
                onClick={deleteSelected}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs font-medium border border-[#eaeaea] bg-white text-[#f31260] px-3 py-1.5 rounded-md hover:bg-[#fff0f3] transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove {selected.size}
              </button>
            </>
          )}

          {/* The spacer is what pins the filters right, but in a wrapping row
              on a phone it claims a line of its own and leaves an empty band
              between the search box and the filters. Below sm the search is
              full width anyway, so there's nothing to push. */}
          <div className="hidden sm:block flex-1" />

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
          <div className="w-40">
            <Select
              value={filters.outcome}
              onChange={(v) => applyFilters({ outcome: v })}
              placeholder="Any outcome"
              options={CALL_OUTCOME_OPTIONS}
              clearable
            />
          </div>
          <div className="w-40">
            <Select
              value={filters.rep}
              onChange={(v) => applyFilters({ rep: v })}
              placeholder="Any rep"
              options={repOptions}
              searchable
              clearable
            />
          </div>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#999]" />}
        </div>

        {/* What the colours on this sheet mean. Without it a highlighted row
            is just a highlighted row, and whoever painted it is the only one
            who knows why. */}
        {palette.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap px-4 pb-3 -mt-1">
            <span className="text-[11px] font-medium text-[#999] uppercase tracking-wider">Legend</span>
            {palette.map((color) => (
              <span
                key={color.id}
                className="inline-flex items-center gap-1.5 text-[11px] text-[#444] border border-[#eaeaea] rounded-full pl-1.5 pr-2.5 py-0.5"
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${SWATCH_BY_ID.get(color.swatch)?.dot ?? "bg-[#999]"}`} />
                {color.name}
              </span>
            ))}
            {canEdit && (
              <button onClick={() => setShowColumns(true)} className="text-[11px] text-[#0070f3] hover:underline">
                Edit
              </button>
            )}
          </div>
        )}

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
            {/* border-separate, not collapse: a collapsed border belongs to
                the table rather than the cell, so the frozen pane's own right
                border scrolls away with the body and the pane loses its edge.
                table-fixed so the colgroup below is obeyed exactly, which is
                what the pane's offsets are measured against. */}
            <table
              className="table-fixed border-separate border-spacing-0"
              style={{ width: columnWidths.reduce((sum, w) => sum + w, 0) }}
            >
              <colgroup>
                {columnWidths.map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-20">
                <tr className="bg-[#fafafa]">
                  {canEdit && (
                    <th
                      style={{ left: pins.check }}
                      className="sticky z-30 bg-[#fafafa] border-r border-b border-[#eaeaea] px-2 h-9"
                    >
                      <input
                        type="checkbox"
                        checked={pageFullySelected}
                        onChange={(e) => {
                          const all = e.target.checked;
                          setSelected((prev) => {
                            const next = new Set(prev);
                            for (const r of rows) {
                              if (all) next.add(r.rowId);
                              else next.delete(r.rowId);
                            }
                            return next;
                          });
                        }}
                        aria-label="Select every row on this page"
                        className="w-3 h-3 accent-[#0a0a0a] cursor-pointer"
                      />
                    </th>
                  )}
                  <th
                    style={{ left: pins.no }}
                    className="sticky z-30 bg-[#fafafa] border-r border-b border-[#eaeaea] px-2 h-9 text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider"
                  >
                    {columnDefs[0].label}
                  </th>
                  <th
                    style={{ left: pins.company }}
                    className={`sticky z-30 ${PIN_EDGE} bg-[#fafafa] border-r border-b border-[#eaeaea] px-2 h-9 text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider`}
                  >
                    {columnDefs[1].label}
                  </th>
                  {columnDefs.slice(2).map((col) => (
                    <th
                      key={col.key}
                      // Clipped, not wrapped: under table-fixed a label wider
                      // than its column overflows into the next one instead of
                      // widening it, and "Caller Feedback / Prospect's Stated
                      // Problem" is wider than any sane column. The full text
                      // is on hover.
                      title={col.label}
                      className="bg-[#fafafa] border-r border-b border-[#eaeaea] px-2 h-9 text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider truncate"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const state = saveState[row.rowId] ?? "idle";
                  const company = factCell(row, "companyName");
                  const dueSoon =
                    row.followUpDate !== null && row.followUpDate <= new Date().toISOString().slice(0, 10);
                  return (
                    <tr
                      key={row.rowId}
                      className={`group ${row.doNotCall ? "bg-[#fef2f2]" : "hover:bg-[#fafafa]"} transition-colors`}
                    >
                      {canEdit && (
                        <td
                          style={{ left: pins.check }}
                          className={`sticky z-10 ${row.doNotCall ? "bg-[#fef2f2]" : "bg-white group-hover:bg-[#fafafa]"} ${CELL} border-[#eaeaea]`}
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
                        style={{ left: pins.no }}
                        className={`sticky z-10 ${row.doNotCall ? "bg-[#fef2f2]" : "bg-white group-hover:bg-[#fafafa]"} ${CELL} border-[#eaeaea] text-[11px] text-[#999] tabular-nums`}
                      >
                        {/* The save indicator sits with the row number rather
                            than in a column of its own at the far right, which
                            was blank whenever nothing was saving and, being
                            past twenty other columns, was never on screen at
                            the moment it had something to say. Here it is in
                            the frozen pane, next to the row it refers to. */}
                        <div className="flex items-center justify-between gap-1">
                          <span>{row.position}</span>
                          {state === "saving" && <Loader2 className="w-3 h-3 animate-spin text-[#bbb] shrink-0" />}
                          {state === "saved" && <Check className="w-3 h-3 text-[#17c964] shrink-0" />}
                          {state === "error" && (
                            <span title="Not saved. Check the error above" className="shrink-0">
                              <AlertTriangle className="w-3 h-3 text-[#f31260]" />
                            </span>
                          )}
                          {/* A do-not-call row is read-only, and this is the
                              way back: the DNC column itself can be hidden,
                              and a row nobody can unlock is a dead row. */}
                          {row.doNotCall && canEdit && (
                            <button
                              onClick={() => unlockRow(row)}
                              title="Do not call. Click to turn that off and edit this row."
                              aria-label={`Turn off do not call for row ${row.position}`}
                              className="shrink-0 p-0.5 rounded text-[#f31260] hover:bg-[#fde8e8] transition-colors"
                            >
                              <Lock className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td
                        style={{ left: pins.company }}
                        className={`sticky z-10 ${PIN_EDGE} ${row.doNotCall ? "bg-[#fef2f2]" : "bg-white group-hover:bg-[#fafafa]"} ${CELL} border-[#eaeaea]`}
                      >
                        <div className="flex items-center gap-1">
                          {/* min-w-0 or the name refuses to shrink inside the
                              flex row and widens the whole frozen pane. */}
                          <input
                            type="text"
                            defaultValue={company.value}
                            key={`co-${row.rowId}-${company.value}`}
                            disabled={!canEdit || row.doNotCall}
                            onBlur={(e) => submitFact(row, "companyName", e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                            title={company.value}
                            className={`${INPUT} min-w-0 font-medium ${company.pending ? "text-[#946c00]" : ""}`}
                          />
                          {/* The row tag lives on the frozen column so it
                              stays in sight however far the sheet is
                              scrolled sideways. */}
                          {rowHasPending(row) && (
                            <span
                              title="Waiting on an administrator"
                              className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-[#946c00] bg-[#fefce8] border border-[#f7e6a8] rounded px-1 py-0.5"
                            >
                              Updated
                            </span>
                          )}
                          <CopyButton value={company.value} label="company name" revealOnHover />
                        </div>
                      </td>

                      {/* Lead facts. Editable here, because the person on the
                          phone is the one who finds out that a name or a
                          number is wrong. A campaign grant is still not
                          permission to rewrite the lead database, so an
                          editor's change is queued for an administrator,
                          whose own edits go straight through. */}
                      {shows("address1") && (
                        factTd(row, "address1")
                      )}
                      {shows("city") && (
                        factTd(row, "city")
                      )}
                      {shows("state") && (
                        factTd(row, "state")
                      )}
                      {shows("zip") && (
                        factTd(row, "zip")
                      )}
                      {shows("category") && (
                        factTd(row, "category")
                      )}
                      {shows("phone") && (
                        factTd(row, "phone", (v) =>
                          v ? (
                            <a
                              href={telHref(v)}
                              title={`Call ${formatPhone(v)}`}
                              className="shrink-0 p-0.5 rounded text-[#0070f3] hover:bg-[#eff6ff] transition-colors"
                            >
                              <Phone className="w-3 h-3" />
                            </a>
                          ) : null,
                        )
                      )}
                      {shows("email") && (
                        factTd(row, "email", (v) =>
                          emailAddress(v) ? (
                            <a
                              href={`mailto:${v}`}
                              title={`Email ${v}`}
                              className="shrink-0 p-0.5 rounded text-[#0070f3] hover:bg-[#eff6ff] transition-colors"
                            >
                              <Mail className="w-3 h-3" />
                            </a>
                          ) : null,
                        )
                      )}
                      {shows("contact") && (
                        factTd(row, "contactName", (v) => (
                          <CopyButton value={v} label="contact name" revealOnHover />
                        ))
                      )}

                      {/* Call results: the editable half of the sheet. The
                          pickers are the app's own, floating out of the
                          sheet's scroll container so they open over it
                          instead of being clipped by it. */}
                      {shows("callDate") && (
                        <td onContextMenu={(e) => openPaint(e, row, "callDate")} className={cellClass(row, "callDate")}>
                          <DateTimePicker
                            value={row.callDate ?? ""}
                            onChange={(v) => commit(row, { callDate: v || null })}
                            dateOnly
                            clearable
                            floating
                            variant="cell"
                            disabled={!canEdit || row.doNotCall}
                            placeholder="Not called"
                          />
                        </td>
                      )}
                      {shows("attempts") && (
                        <td onContextMenu={(e) => openPaint(e, row, "attempts")} className={cellClass(row, "attempts")}>
                          <input
                            type="text"
                            inputMode="numeric"
                            defaultValue={row.attempts ? String(row.attempts) : ""}
                            key={`at-${row.rowId}-${row.attempts}`}
                            disabled={!canEdit || row.doNotCall}
                            onBlur={(e) => commit(row, { attempts: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                            className={`${INPUT} tabular-nums`}
                          />
                        </td>
                      )}
                      {shows("outcome") && (
                        <td onContextMenu={(e) => openPaint(e, row, "outcome")} className={cellClass(row, "outcome")}>
                          {/* showUnlistedValue: an outcome saved before this
                              list changed still has to display, or the row
                              would look blank and saving it would clear it. */}
                          <Select
                            value={row.callOutcome ?? ""}
                            onChange={(v) => commit(row, { callOutcome: v || null })}
                            options={CALL_OUTCOME_OPTIONS}
                            placeholder="-"
                            variant="cell"
                            floating
                            clearable
                            showUnlistedValue
                            disabled={!canEdit || row.doNotCall}
                            className={`rounded ${row.callOutcome ? (CALL_OUTCOME_STYLES[row.callOutcome] ?? "") : ""}`}
                          />
                        </td>
                      )}
                      {shows("feedback") && (
                        <td onContextMenu={(e) => openPaint(e, row, "feedback")} className={cellClass(row, "feedback")}>
                          <input
                            type="text"
                            defaultValue={row.callerFeedback ?? ""}
                            key={`fb-${row.rowId}-${row.callerFeedback ?? ""}`}
                            disabled={!canEdit || row.doNotCall}
                            placeholder={canEdit ? "What they said…" : ""}
                            onBlur={(e) => commit(row, { callerFeedback: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                            className={INPUT}
                          />
                        </td>
                      )}
                      {shows("interested") && (
                        <td onContextMenu={(e) => openPaint(e, row, "interested")} className={cellClass(row, "interested")}>
                          {/* allowCustom, because callers hear things that
                              aren't on any list, and rounding that to the
                              nearest option loses the useful part. */}
                          <Select
                            value={row.interestedIn ?? ""}
                            onChange={(v) => commit(row, { interestedIn: v })}
                            options={SERVICE_OPTIONS}
                            placeholder="-"
                            variant="cell"
                            floating
                            clearable
                            allowCustom
                            customPlaceholder="What they asked about"
                            disabled={!canEdit || row.doNotCall}
                          />
                        </td>
                      )}
                      {shows("bestTime") && (
                        <td onContextMenu={(e) => openPaint(e, row, "bestTime")} className={cellClass(row, "bestTime")}>
                          <Select
                            value={row.bestTime ?? ""}
                            onChange={(v) => commit(row, { bestTime: v })}
                            options={BEST_TIME_OPTIONS}
                            placeholder="-"
                            variant="cell"
                            floating
                            clearable
                            allowCustom
                            customPlaceholder="When to call back"
                            disabled={!canEdit || row.doNotCall}
                          />
                        </td>
                      )}
                      {shows("followUp") && (
                        <td onContextMenu={(e) => openPaint(e, row, "followUp")} className={cellClass(row, "followUp", dueSoon ? "bg-[#fef2f2]" : "")}>
                          {/* quickDates: on a call sheet the answer is almost
                              always today, tomorrow or next week. */}
                          <DateTimePicker
                            value={row.followUpDate ?? ""}
                            onChange={(v) => commit(row, { followUpDate: v || null })}
                            dateOnly
                            clearable
                            quickDates
                            floating
                            variant="cell"
                            disabled={!canEdit || row.doNotCall}
                            placeholder="None"
                          />
                        </td>
                      )}
                      {shows("nextAction") && (
                        <td onContextMenu={(e) => openPaint(e, row, "nextAction")} className={cellClass(row, "nextAction")}>
                          <input
                            type="text"
                            defaultValue={row.nextAction ?? ""}
                            key={`na-${row.rowId}-${row.nextAction ?? ""}`}
                            disabled={!canEdit || row.doNotCall}
                            placeholder={canEdit ? "Next step…" : ""}
                            onBlur={(e) => commit(row, { nextAction: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                            className={INPUT}
                          />
                        </td>
                      )}
                      {shows("rep") && (
                        <td onContextMenu={(e) => openPaint(e, row, "rep")} className={cellClass(row, "rep")}>
                          <Select
                            value={row.assignedRep ?? ""}
                            onChange={(id) =>
                              commit(row, {
                                assignedRep: id || null,
                                // Denormalised so the sheet and its export read
                                // a name without joining employees per row.
                                assignedRepName: repOptions.find((r) => r.value === id)?.label ?? null,
                              })
                            }
                            options={repOptions}
                            placeholder="Unassigned"
                            variant="cell"
                            floating
                            searchable
                            clearable
                            // Who works a row is a management decision, not part
                            // of filling the sheet in. Enforced by
                            // campaign_leads_guard_rep, this only stops the
                            // control being offered to someone it would refuse.
                            disabled={!isAdmin || row.doNotCall}
                          />
                        </td>
                      )}
                      {shows("dnc") && (
                        <td onContextMenu={(e) => openPaint(e, row, "dnc")} className={cellClass(row, "dnc", "text-center")}>
                          <input
                            type="checkbox"
                            checked={row.doNotCall}
                            disabled={!canEdit}
                            onChange={(e) => commit(row, { doNotCall: e.target.checked })}
                            aria-label="Do not call"
                            className="w-3 h-3 accent-[#f31260] cursor-pointer"
                          />
                        </td>
                      )}
                      {shows("notes") && (
                        <td onContextMenu={(e) => openPaint(e, row, "notes")} className={cellClass(row, "notes")}>
                          <input
                            type="text"
                            defaultValue={row.notes ?? ""}
                            // Keyed on the stored value so a refetch (somebody
                            // else's edit, a filter change) replaces what's in
                            // the box, the same way the other free-text cells
                            // behave.
                            key={`notes-${row.rowId}-${row.notes ?? ""}`}
                            disabled={!canEdit || row.doNotCall}
                            // Follows the heading: a campaign that calls this column
                          // "Notes/Call Summary" shouldn't prompt for
                          // something else.
                          placeholder={canEdit ? columnLabel(campaign?.columns, "notes", "Anything worth knowing…") : ""}
                            title={row.notes ?? ""}
                            onBlur={(e) => commit(row, { notes: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                            className={INPUT}
                          />
                        </td>
                      )}

                      {/* Whatever this campaign added for itself. Free text,
                          stored on the row against the column's id, so
                          renaming the column later keeps what people typed. */}
                      {extraColumns.map((col) => (
                        <td
                          key={col.id}
                          className={cellClass(row, `x:${col.id}`)}
                          onContextMenu={(e) => openPaint(e, row, `x:${col.id}`)}
                        >
                          <input
                            type="text"
                            defaultValue={row.extra[col.id] ?? ""}
                            key={`x-${row.rowId}-${col.id}-${row.extra[col.id] ?? ""}`}
                            disabled={!canEdit || row.doNotCall}
                            placeholder={canEdit ? col.label : ""}
                            title={row.extra[col.id] ?? ""}
                            onBlur={(e) =>
                              commit(row, { extra: { ...row.extra, [col.id]: e.target.value.trim() } })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                            className={INPUT}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
      {/* The colour menu. A full-screen catcher behind it closes it on the
          next click anywhere, including the next right-click. */}
      {paint && (
        <div
          className="fixed inset-0 z-[90]"
          onClick={() => {
            setPaint(null);
            setNewColor(null);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setPaint(null);
            setNewColor(null);
          }}
        >
          <div
            style={{ left: Math.min(paint.x, window.innerWidth - 200), top: Math.min(paint.y, window.innerHeight - 40 - palette.length * 32) }}
            className="absolute w-48 bg-white border border-[#eaeaea] rounded-lg shadow-xl py-1"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 py-1 text-[10px] font-semibold text-[#bbb] uppercase tracking-wider truncate">
              {paint.key === ROW_COLOR_KEY ? "Whole row" : (columnDefs.find((c) => c.key === paint.key)?.label ?? "Cell")}
            </p>
            {palette.length === 0 && !newColor && (
              <p className="px-3 py-1.5 text-[12px] text-[#999] leading-snug">
                No colours yet. Make one and it joins the legend above the sheet.
              </p>
            )}
            {palette.map((color) => (
              <button
                key={color.id}
                onClick={() => applyPaint(color.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-[#444] hover:bg-[#fafafa] transition-colors"
              >
                <span className={`w-3 h-3 rounded-full shrink-0 ${SWATCH_BY_ID.get(color.swatch)?.dot ?? "bg-[#999]"}`} />
                <span className="truncate">{color.name}</span>
              </button>
            ))}
            {palette.length > 0 && !newColor && (
              <button
                onClick={() => applyPaint(null)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-[#666] hover:bg-[#fafafa] transition-colors"
              >
                <span className="w-3 h-3 rounded-full border border-[#ddd] shrink-0" />
                No colour
              </button>
            )}

            {newColor ? (
              <div className="px-3 pt-2 pb-2.5 border-t border-[#f5f5f5] mt-1">
                <div className="flex items-center gap-1 mb-2">
                  {SWATCHES.map((swatch) => (
                    <button
                      key={swatch.id}
                      onClick={() => setNewColor({ ...newColor, swatch: swatch.id })}
                      aria-label={swatch.label}
                      title={swatch.label}
                      className={`w-4 h-4 rounded-full ${swatch.dot} transition-transform ${
                        newColor.swatch === swatch.id ? "ring-2 ring-offset-1 ring-[#0a0a0a] scale-110" : "hover:scale-110"
                      }`}
                    />
                  ))}
                </div>
                <input
                  autoFocus
                  value={newColor.name}
                  onChange={(e) => setNewColor({ ...newColor, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addColorAndApply();
                    if (e.key === "Escape") setNewColor(null);
                  }}
                  placeholder="What it means"
                  className="w-full border border-[#eaeaea] rounded-md px-2 py-1.5 text-[12px] text-[#0a0a0a] placeholder:text-[#bbb] outline-none focus:border-[#0070f3] transition-colors"
                />
                <div className="flex items-center gap-1.5 mt-1.5">
                  <button
                    onClick={addColorAndApply}
                    disabled={!newColor.name.trim()}
                    className="flex-1 text-[11px] font-semibold bg-[#0a0a0a] text-white py-1.5 rounded-md hover:bg-[#333] transition-colors disabled:opacity-40"
                  >
                    Add and use
                  </button>
                  <button
                    onClick={() => setNewColor(null)}
                    className="text-[11px] font-medium text-[#666] px-2 py-1.5 rounded-md hover:bg-[#f5f5f5] transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={startNewColor}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-[#0070f3] hover:bg-[#f5faff] transition-colors border-t border-[#f5f5f5] mt-1 pt-2"
              >
                <Plus className="w-3 h-3 shrink-0" />
                New colour
              </button>
            )}
          </div>
        </div>
      )}

      {showColumns && campaign && canEdit && (
        <SheetColumnsModal
          campaign={campaign}
          onClose={() => setShowColumns(false)}
          // The campaign list is realtime, so the new headings arrive on
          // their own; the rows are refetched because a column removed and
          // re-added is a different column.
          onSaved={() => setRevision((r) => r + 1)}
        />
      )}
      {showAddLeads && campaign && canEdit && (
        <AddLeadsToSheetModal
          campaignId={campaign.id}
          campaignName={campaign.name}
          onClose={() => setShowAddLeads(false)}
          onAdded={(message) => {
            success(message);
            setRevision((r) => r + 1);
          }}
        />
      )}
      {showReview && campaign && isAdmin && (
        <ReviewChangesModal
          campaignId={campaign.id}
          campaignName={campaign.name}
          onClose={() => setShowReview(false)}
          onReviewed={(approved, rejected) => {
            // Refetched rather than patched: an approval rewrites the lead,
            // so the sheet's copy of those facts is now stale, as is anything
            // typed over them in this session.
            setLocalFacts({});
            setRevision((r) => r + 1);
            const parts = [
              approved > 0 && `Approved ${approved.toLocaleString()}`,
              rejected > 0 && `turned down ${rejected.toLocaleString()}`,
            ].filter(Boolean);
            if (parts.length > 0) success(`${parts.join(", ")}.`);
          }}
        />
      )}
    </div>
  );
}
