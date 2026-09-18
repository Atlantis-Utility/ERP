"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { getErrorMessage } from "../utils";
import { logActivity, type ActivityActor, type ActivityEntry } from "./lead-activity";

const TABLE = "leads";

/**
 * Lead stages, in call order.
 *
 * `new` is the arrival stage, an imported lead nobody has rung yet. It's
 * kept separate from `contacted` on purpose: labelling ten thousand untouched
 * imports as "contacted" would make the one number a caller needs (how many
 * are left) unreadable.
 *
 * `not_interested` and `do_not_call` are terminal. They're distinct because
 * the second is an instruction, not an outcome: a "no thanks" can be tried
 * again next quarter, an opt-out cannot.
 */
export type LeadStatus =
  "new" | "contacted" | "follow_up" | "interested" | "appointment" | "not_interested" | "do_not_call";

// "linkedin_csv" predates importing anything other than a Sales Navigator
// export. Rows written then still carry it, so it stays readable, while
// anything imported now records the honest "file_import".
export type LeadSource = "azure_maps" | "linkedin_csv" | "file_import" | "manual";
export type LeadPriority = "low" | "medium" | "high";

/**
 * What the current user may do with a lead, as decided by the database and
 * returned with the row (see leads_access_level in
 * supabase/migration-record-access.sql). Sent per row on purpose: working it
 * out client-side would mean holding every access grant in memory, and an
 * administrator can share thousands of leads.
 */
export type LeadAccessLevel = "admin" | "owner" | "editor" | "viewer";

export interface Lead {
  id: string;
  companyName: string;
  dba?: string; // "Doing Business As", trade name, if different from the legal company name
  businessType?: string;
  pocName?: string;
  pocTitle?: string;
  phone?: string;
  email?: string; // not available from Azure Maps, manual entry only
  website?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number; // from Azure Maps enrichment, drives the embedded map without re-geocoding
  lon?: number;
  location?: string; // raw location text (e.g. from a LinkedIn CSV) before/without a Places match
  companySize?: string; // e.g. "11-50" (LinkedIn doesn't have an export API, so this is filled in by hand)
  linkedinUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  source: LeadSource;
  mapsPlaceId?: string; // dedupe key for Azure Maps-sourced/enriched leads
  status: LeadStatus;
  /** What this company does / why they're a lead. Long-form, and searchable. */
  description?: string;
  /**
   * Legacy single notes string. Superseded by the lead_notes thread (which is
   * per-author and shareable), and by `description` for "what is this
   * company". Kept on the type so older rows still round-trip, but nothing
   * writes it anymore.
   */
  notes?: string;
  assignedTo?: string; // employee id; drives who can see the lead at all
  assignedToName?: string; // denormalized so the table doesn't need an employees join
  followUpDate?: string; // ISO date (yyyy-mm-dd), drives the overdue indicator
  priority?: LeadPriority;
  nextStep?: string; // the single next action, the thing a lead review asks about
  lostReason?: string; // why a lost/unqualified lead closed out
  tags?: string[]; // free-form segmentation (campaign, vertical, territory)
  createdBy?: string; // employee id
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Set on rows that came back from a query that computes it. Absent on leads
   * assembled locally (a CSV candidate, a merge result), so callers treat
   * "missing" as "fall back to what the client can work out".
   */
  accessLevel?: LeadAccessLevel;
}

interface Row {
  id: string;
  status: LeadStatus;
  data: Lead;
  access_level?: LeadAccessLevel;
}

// Stage names this app has used before. An unmapped status renders as an
// empty, unstyled pill, so an old value is translated on read rather than
// showing up blank: a stale draft, an old export, or a row written before
// the stages were simplified.
const LEGACY_STATUS: Record<string, LeadStatus> = {
  converted: "appointment",
  won: "appointment",
  qualified: "interested",
  proposal: "interested",
  negotiation: "interested",
  lost: "not_interested",
  unqualified: "not_interested",
};

const normalizeStatus = (status: string): LeadStatus => (LEGACY_STATUS[status] ?? status) as LeadStatus;

const fromRow = (row: Row): Lead => ({
  ...row.data,
  id: row.id,
  status: normalizeStatus(row.status),
  ...(row.access_level ? { accessLevel: row.access_level } : {}),
});

function withTimeout<T>(promise: PromiseLike<T>, ms = 20_000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out. Check your connection and try again.")), ms),
    ),
  ]);
}

/* ─── Querying ──────────────────────────────────────────────────────────
 *
 * The rest of lib/db syncs a whole table to the browser and filters in
 * React. That doesn't survive tens of thousands of leads: the
 * payload, the JSON re-parse on every realtime change, and the row count
 * handed to React all grow with the table.
 *
 * So leads are queried a page at a time through the SQL functions in
 * supabase/migration-record-access.sql, filtering, sorting, counting and
 * bulk writes all happen in the database. Those functions run with invoker
 * rights, so RLS scopes every one of them to the leads the caller may see,
 * and a member's search can't reach anyone else's leads.
 */

export interface LeadFilters {
  search: string;
  status: string;
  /** Employee id, "unassigned", or "" for any. */
  assignedTo: string;
  priority: string;
  source: string;
  /** Exact city, matched case-insensitively in SQL. */
  city: string;
  overdue: boolean;
  stale: boolean;
}

export const EMPTY_FILTERS: LeadFilters = {
  search: "",
  status: "",
  assignedTo: "",
  priority: "",
  source: "",
  city: "",
  overdue: false,
  stale: false,
};

export const STALE_DAYS = 14;

export type LeadSortKey = "updated_at" | "company_name" | "follow_up_date";

export interface LeadQuery {
  filters: LeadFilters;
  sort: LeadSortKey;
  desc: boolean;
  page: number; // 0-based
  pageSize: number;
}

export interface LeadStats {
  total: number;
  /** Leads that got as far as a booked appointment. */
  appointments: number;
  /** Closed out: not interested, or opted out entirely. */
  notInterested: number;
  overdue: number;
  stale: number;
  unassigned: number;
}

export interface StageCount {
  n: number;
}

// Shared argument shape for every filtering function, so the SQL and the
// client can't drift on what a filter means.
const filterArgs = (f: LeadFilters) => ({
  p_search: f.search.trim() || null,
  p_status: f.status || null,
  p_assigned_to: f.assignedTo || null,
  p_priority: f.priority || null,
  p_source: f.source || null,
  p_overdue: f.overdue,
  p_stale: f.stale,
  p_stale_days: STALE_DAYS,
  // Sent only when set. PostgREST picks the function by the argument names
  // it's given, so leaving p_city off matches the pre-city version of these
  // functions too, and the page keeps working against a database where
  // migration-campaign-approvals.sql hasn't been run yet.
  ...(f.city ? { p_city: f.city } : {}),
});

/**
 * Turns the specific failure of "the SQL side isn't installed" into an
 * instruction instead of a generic error. PostgREST answers PGRST202 for a
 * function it can't find, which is exactly what happens if the app ships
 * before supabase/migration-record-access.sql has been run.
 */
const MIGRATION_HINT =
  "The leads database functions aren't installed yet. Run supabase/migration-record-access.sql in the Supabase SQL editor, then reload.";

function leadsError(err: unknown, fallback: string): string {
  const code = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  const message = err && typeof err === "object" ? String((err as { message?: unknown }).message ?? "") : "";
  if (code === "PGRST202" || /could not find the function/i.test(message)) return MIGRATION_HINT;
  return getErrorMessage(err, fallback);
}

/** Identifies a query, so a component can tell a stale response from a current one. */
export function leadsQueryKey(q: LeadQuery): string {
  return JSON.stringify([q.filters, q.sort, q.desc, q.page, q.pageSize]);
}

export async function fetchLeadsPage(q: LeadQuery): Promise<Lead[]> {
  const { data, error } = await withTimeout(
    supabase.rpc("leads_search", {
      ...filterArgs(q.filters),
      p_sort: q.sort,
      p_desc: q.desc,
      p_limit: q.pageSize,
      p_offset: q.page * q.pageSize,
    }),
  );
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

export async function fetchLeadStats(filters: LeadFilters): Promise<LeadStats> {
  const { data, error } = await withTimeout(supabase.rpc("leads_stats", filterArgs(filters)));
  if (error) throw error;
  // The function returns one row; PostgREST hands back an array for a
  // table-returning function.
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        total: number;
        appointments: number;
        not_interested: number;
        overdue: number;
        stale: number;
        unassigned: number;
      }
    | undefined;
  return {
    total: Number(row?.total ?? 0),
    appointments: Number(row?.appointments ?? 0),
    notInterested: Number(row?.not_interested ?? 0),
    overdue: Number(row?.overdue ?? 0),
    stale: Number(row?.stale ?? 0),
    unassigned: Number(row?.unassigned ?? 0),
  };
}

export async function fetchStageCounts(filters: LeadFilters): Promise<Record<string, StageCount>> {
  const args = filterArgs(filters);
  const { data, error } = await withTimeout(
    supabase.rpc("leads_stage_counts", {
      p_search: args.p_search,
      p_assigned_to: args.p_assigned_to,
      p_priority: args.p_priority,
      p_source: args.p_source,
      p_overdue: args.p_overdue,
      p_stale: args.p_stale,
      p_stale_days: args.p_stale_days,
    }),
  );
  if (error) throw error;
  const out: Record<string, StageCount> = {};
  for (const r of (data ?? []) as { status: string; n: number }[]) {
    out[normalizeStatus(r.status)] = { n: Number(r.n) };
  }
  return out;
}

export interface LeadsPageResult {
  key: string;
  rows: Lead[];
  stats: LeadStats | null;
  error: string;
}

/**
 * Runs one page query plus its aggregates and hands the result to `cb`.
 *
 * Shaped as "start work, return a canceller" rather than an async hook so
 * the calling effect passes a setter instead of calling one, the same
 * arrangement subscribeTable uses, and what keeps state out of the
 * synchronous effect body.
 */
export function queryLeadsPage(q: LeadQuery, cb: (result: LeadsPageResult) => void): () => void {
  let cancelled = false;
  const key = leadsQueryKey(q);

  (async () => {
    try {
      const [rows, stats] = await Promise.all([fetchLeadsPage(q), fetchLeadStats(q.filters)]);
      if (!cancelled) cb({ key, rows, stats, error: "" });
    } catch (err) {
      console.error("[leads] page query failed:", err);
      if (!cancelled) {
        cb({ key, rows: [], stats: null, error: leadsError(err, "Failed to load leads") });
      }
    }
  })();

  return () => {
    cancelled = true;
  };
}

export interface LeadsBoardResult {
  key: string;
  columns: Record<string, Lead[]>;
  counts: Record<string, StageCount>;
  error: string;
}

/**
 * The stage board: per-stage counts plus the first `perColumn` cards of
 * each stage. A board can't render a stage holding thousands of leads, so the
 * column header carries the real count and the cards are a window onto it.
 */
export function queryLeadsBoard(
  filters: LeadFilters,
  stages: LeadStatus[],
  perColumn: number,
  sort: LeadSortKey,
  desc: boolean,
  cb: (result: LeadsBoardResult) => void,
): () => void {
  let cancelled = false;
  const key = JSON.stringify([filters, stages, perColumn, sort, desc]);

  (async () => {
    try {
      const [counts, ...columnRows] = await Promise.all([
        fetchStageCounts(filters),
        ...stages.map((status) =>
          fetchLeadsPage({
            filters: { ...filters, status },
            sort,
            desc,
            page: 0,
            pageSize: perColumn,
          }),
        ),
      ]);
      if (cancelled) return;
      const columns: Record<string, Lead[]> = {};
      stages.forEach((status, i) => {
        columns[status] = columnRows[i];
      });
      cb({ key, columns, counts, error: "" });
    } catch (err) {
      console.error("[leads] board query failed:", err);
      if (!cancelled) {
        cb({ key, columns: {}, counts: {}, error: leadsError(err, "Failed to load the stage board") });
      }
    }
  })();

  return () => {
    cancelled = true;
  };
}

/* ─── Single lead ───────────────────────────────────────────────────────── */

export async function getLead(id: string): Promise<Lead | null> {
  // Via the RPC rather than a plain select so the row arrives with the
  // caller's access level attached, the same as a page query.
  const { data, error } = await withTimeout(supabase.rpc("leads_get", { p_id: id }));
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  return rows.length > 0 ? fromRow(rows[0]) : null;
}

/**
 * Full records for specific ids, chunked so the `in` list stays a sane URL
 * length. Used by CSV import: the dedupe index finds which existing leads a
 * file collides with, and only those get fetched in full for the merge.
 */
export async function fetchLeadsByIds(ids: string[]): Promise<Lead[]> {
  if (ids.length === 0) return [];
  const out: Lead[] = [];
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await withTimeout(
      supabase
        .from(TABLE)
        .select("id, status, data")
        .in("id", ids.slice(i, i + CHUNK)),
      30_000,
    );
    if (error) throw error;
    out.push(...(data as Row[]).map(fromRow));
  }
  return out;
}

/**
 * Which of these lead ids already exist. Used by Azure Maps discovery to mark
 * places that are already on file, it can't ask a full client-side copy of
 * the table anymore, and only needs an answer for the handful of results on
 * screen.
 */
export async function fetchExistingLeadIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await withTimeout(supabase.from(TABLE).select("id").in("id", ids));
  if (error) throw error;
  return new Set((data as { id: string }[]).map((r) => r.id));
}

export interface LeadSnapshot {
  leadId: string;
  lead: Lead | null;
  error: string;
}

/**
 * One lead, kept live. The detail drawer used to find its lead inside a
 * full-table subscription; at this scale it fetches just the row it needs and
 * watches only that row.
 */
export function subscribeLead(id: string, cb: (snapshot: LeadSnapshot) => void): () => void {
  let cancelled = false;

  const load = async () => {
    try {
      const lead = await getLead(id);
      if (!cancelled) cb({ leadId: id, lead, error: "" });
    } catch (err) {
      console.error("[leads] single-lead load failed:", err);
      if (!cancelled) cb({ leadId: id, lead: null, error: leadsError(err, "Failed to load this lead") });
    }
  };

  load();

  const channel = supabase
    .channel(`lead-${id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `id=eq.${id}` }, () => {
      if (!cancelled) load();
    })
    .subscribe();

  return () => {
    cancelled = true;
    supabase.removeChannel(channel);
  };
}

export function useLead(id: string | null): { lead: Lead | null; loading: boolean; error: string } {
  const [snapshot, setSnapshot] = useState<LeadSnapshot | null>(null);

  useEffect(() => {
    if (!id) return;
    return subscribeLead(id, setSnapshot);
  }, [id]);

  const isCurrent = id !== null && snapshot?.leadId === id;
  return {
    lead: isCurrent ? snapshot.lead : null,
    loading: id !== null && !isCurrent,
    error: isCurrent ? snapshot.error : "",
  };
}

/* ─── Change signal ─────────────────────────────────────────────────────── */

const changeListeners = new Set<() => void>();
let changeChannel: ReturnType<typeof supabase.channel> | null = null;

function subscribeLeadChanges(cb: () => void): () => void {
  changeListeners.add(cb);
  if (!changeChannel) {
    changeChannel = supabase
      .channel("leads-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, () => {
        changeListeners.forEach((l) => l());
      })
      .subscribe();
  }
  return () => {
    changeListeners.delete(cb);
    if (changeListeners.size === 0 && changeChannel) {
      supabase.removeChannel(changeChannel);
      changeChannel = null;
    }
  };
}

/**
 * Increments whenever any visible lead changes, so a page can re-run its
 * current query instead of syncing the table.
 *
 * Debounced hard on purpose: assigning ten thousand leads emits a change
 * event per row, and re-querying on each one would be thousands of redundant
 * round trips. One refresh shortly after the dust settles is what's wanted.
 */
export function useLeadsRevision(): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeLeadChanges(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRevision((r) => r + 1), 600);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  return revision;
}

/* ─── Writes ────────────────────────────────────────────────────────────── */

const toRow = (lead: Lead) => ({
  id: lead.id,
  status: lead.status,
  updated_at: lead.updatedAt,
  data: lead,
});

export async function addLead(lead: Lead, actor?: ActivityActor | null): Promise<void> {
  const { error } = await withTimeout(supabase.from(TABLE).upsert(toRow(lead)));
  if (error) throw error;
  await logActivity(
    [
      {
        leadId: lead.id,
        kind: "created",
        summary: lead.assignedToName ? `Lead created and assigned to ${lead.assignedToName}` : "Lead created",
        detail: { source: lead.source },
      },
    ],
    actor ?? null,
  );
}

/**
 * Bulk insert for CSV import. Chunked because a single request carrying
 * thousands of rows is both a large body and all-or-nothing, a failure
 * half way through a 10,000-row import leaves the earlier chunks committed
 * rather than losing everything.
 */
export async function addLeads(
  leads: Lead[],
  actor?: ActivityActor | null,
  onProgress?: (written: number, total: number) => void,
): Promise<void> {
  if (leads.length === 0) return;
  const CHUNK = 250;
  for (let i = 0; i < leads.length; i += CHUNK) {
    const chunk = leads.slice(i, i + CHUNK);
    const { error } = await withTimeout(supabase.from(TABLE).upsert(chunk.map(toRow)), 60_000);
    if (error) throw error;
    onProgress?.(Math.min(i + CHUNK, leads.length), leads.length);
  }

  // One activity row per lead would double the write volume of a large
  // import for no benefit, the per-lead "imported" line says the same thing
  // the lead's own createdAt does. Logged in bulk via SQL instead.
  await logBulkActivity(
    leads.map((l) => l.id),
    "import",
    leads[0].source === "azure_maps" ? "Imported from Azure Maps" : "Imported from a file",
    actor ?? null,
  );
}

// Human-readable labels for the activity trail. Only fields worth a line in
// the history are listed; anything absent here changes silently.
const FIELD_LABELS: Partial<Record<keyof Lead, string>> = {
  companyName: "Company",
  dba: "DBA",
  businessType: "Business type",
  description: "Description",
  pocName: "Point of contact",
  pocTitle: "Contact title",
  phone: "Phone",
  email: "Email",
  website: "Website",
  street: "Street",
  city: "City",
  state: "State",
  zip: "Zip",
  companySize: "Company size",
  linkedinUrl: "LinkedIn",
  instagramUrl: "Instagram",
  facebookUrl: "Facebook",
  followUpDate: "Follow-up date",
  priority: "Priority",
  nextStep: "Next step",
  lostReason: "Close reason",
  tags: "Tags",
};

const displayValue = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "empty";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "empty";
  return String(value);
};

/** Turns a patch into one activity entry per meaningful change. */
function describeChanges(leadId: string, before: Lead, patch: Partial<Lead>): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  if (patch.status !== undefined && patch.status !== before.status) {
    entries.push({
      leadId,
      kind: "stage",
      summary: `Stage moved from ${before.status} to ${patch.status}`,
      detail: { from: before.status, to: patch.status },
    });
  }

  if (patch.assignedTo !== undefined && (patch.assignedTo || "") !== (before.assignedTo || "")) {
    const from = before.assignedToName || "Unassigned";
    const to = patch.assignedToName || "Unassigned";
    entries.push({
      leadId,
      kind: "assigned",
      summary: `Reassigned from ${from} to ${to}`,
      detail: { from: before.assignedTo ?? null, to: patch.assignedTo ?? null },
    });
  }

  for (const [key, label] of Object.entries(FIELD_LABELS) as [keyof Lead, string][]) {
    if (patch[key] === undefined) continue;
    const nextValue = displayValue(patch[key]);
    const prevValue = displayValue(before[key]);
    if (nextValue === prevValue) continue;
    entries.push({
      leadId,
      kind: "field",
      summary: `${label} changed from ${prevValue} to ${nextValue}`,
      detail: { field: key, from: before[key] ?? null, to: patch[key] ?? null },
    });
  }

  return entries;
}

export async function updateLead(id: string, patch: Partial<Lead>, actor?: ActivityActor | null): Promise<void> {
  // RLS decides this read too, so a lead the caller can't see comes back as
  // no rows and .single() errors out rather than silently writing.
  const { data: existing, error: fetchErr } = await supabase.from(TABLE).select("data, status").eq("id", id).single();
  if (fetchErr) throw fetchErr;

  const before: Lead = {
    ...(existing.data as Lead),
    id,
    status: normalizeStatus((existing as { status: string }).status),
  };
  const merged: Lead = { ...before, ...patch, updatedAt: new Date().toISOString() };

  const { error } = await withTimeout(
    supabase.from(TABLE).update({ status: merged.status, updated_at: merged.updatedAt, data: merged }).eq("id", id),
  );
  if (error) throw error;

  await logActivity(describeChanges(id, before, patch), actor ?? null);
}

/* ─── Bulk writes ───────────────────────────────────────────────────────── */

/**
 * What a bulk action applies to: an explicit set of ids, or everything
 * matching the current filters. The filter form matters at scale, assigning
 * every lead in a 10,000-row filter is one statement server-side, with no
 * id list crossing the wire in either direction.
 */
export type BulkTarget = { kind: "ids"; ids: string[] } | { kind: "filters"; filters: LeadFilters };

/**
 * Turns a target into RPC arguments. Exported because lead_grants shares the
 * same "these ids, or everything matching" contract, and the two must agree
 * on what gets sent, a mismatch would silently widen or narrow a bulk action.
 */
export const bulkTargetArgs = (target: BulkTarget) =>
  target.kind === "ids"
    ? { p_ids: target.ids, ...filterArgs(EMPTY_FILTERS) }
    : { p_ids: null, ...filterArgs(target.filters) };

async function logBulkActivity(
  ids: string[],
  kind: string,
  summary: string,
  actor: ActivityActor | null,
): Promise<void> {
  if (ids.length === 0) return;
  try {
    // Chunked: the id array travels in the request body, and one array of
    // tens of thousands of ids is an unreasonably large request.
    const CHUNK = 2000;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { error } = await withTimeout(
        supabase.rpc("leads_log_bulk_activity", {
          p_ids: ids.slice(i, i + CHUNK),
          p_kind: kind,
          p_summary: summary,
          p_actor_id: actor?.id ?? null,
          p_actor_name: actor?.name ?? null,
        }),
        60_000,
      );
      if (error) throw error;
    }
  } catch (err) {
    // Same rule as logActivity: an audit line failing must not make a
    // committed bulk action look like it failed.
    console.warn("[lead_activity] failed to record bulk activity:", err);
  }
}

/**
 * Assigns an owner to many leads (or clears it, with `assignee` null).
 *
 * Returns how many rows actually changed, which is not always what was
 * asked for: reassignment is administrator-only at the database, so for a
 * member this comes back 0 rather than throwing, and the caller reports the
 * real outcome.
 */
export async function assignLeadsBulk(
  target: BulkTarget,
  assignee: { id: string; name: string } | null,
  actor?: ActivityActor | null,
): Promise<number> {
  const { data, error } = await withTimeout(
    supabase.rpc("leads_apply_assign", {
      p_employee_id: assignee?.id ?? null,
      p_employee_name: assignee?.name ?? null,
      ...bulkTargetArgs(target),
    }),
    120_000,
  );
  if (error) throw error;

  const changed = Number(data ?? 0);
  if (changed > 0 && target.kind === "ids") {
    await logBulkActivity(
      target.ids,
      "assigned",
      assignee ? `Reassigned to ${assignee.name}` : "Unassigned",
      actor ?? null,
    );
  }
  return changed;
}

/** Moves many leads to one stage. Returns how many actually moved. */
export async function setLeadsStatusBulk(
  target: BulkTarget,
  status: LeadStatus,
  actor?: ActivityActor | null,
): Promise<number> {
  const { data, error } = await withTimeout(
    supabase.rpc("leads_apply_status", { p_new_status: status, ...bulkTargetArgs(target) }),
    120_000,
  );
  if (error) throw error;

  const changed = Number(data ?? 0);
  if (changed > 0 && target.kind === "ids") {
    await logBulkActivity(target.ids, "stage", `Stage moved to ${status}`, actor ?? null);
  }
  return changed;
}

/** Deletes leads (cascading to their notes and activity). Admin-only at the DB. */
export async function deleteLeadsBulk(target: BulkTarget): Promise<number> {
  const { data, error } = await withTimeout(supabase.rpc("leads_apply_delete", bulkTargetArgs(target)), 120_000);
  if (error) throw error;
  return Number(data ?? 0);
}

export async function removeLead(id: string): Promise<number> {
  return deleteLeadsBulk({ kind: "ids", ids: [id] });
}

/* ─── Import de-duplication ─────────────────────────────────────────────── */

export interface LeadDedupeRecord {
  id: string;
  companyName: string;
  pocName?: string;
  street?: string;
  city?: string;
  zip?: string;
}

/**
 * Company, contact and address for every visible lead, enough to match an
 * incoming CSV against what's already on file, without pulling whole
 * records. At 10,000 leads this is a few hundred KB instead of several
 * megabytes.
 *
 * The address is here because names alone aren't enough: a licence list
 * repeats a company once per permit, and those rows are only recognisable as
 * the same business by where it is.
 */
export async function fetchDedupeIndex(): Promise<LeadDedupeRecord[]> {
  // Paged. PostgREST applies db-max-rows (1000) to a set-returning function
  // too, so a single call against 20,000 leads returns exactly 1000 rows with
  // no error and no indication it truncated, so an import would then
  // de-duplicate against a twentieth of the table and re-add the rest as new.
  // Verified against the live database: .range() pages the RPC correctly.
  const PAGE = 1000;
  const out: LeadDedupeRecord[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await withTimeout(
      supabase.rpc("leads_dedupe_index").range(from, from + PAGE - 1),
      60_000,
    );
    if (error) throw error;
    const rows = (data ?? []) as {
      id: string;
      company_name: string | null;
      poc_name: string | null;
      street?: string | null;
      city?: string | null;
      zip?: string | null;
    }[];
    out.push(
      ...rows.map((r) => ({
        id: r.id,
        companyName: r.company_name ?? "",
        pocName: r.poc_name ?? undefined,
        street: r.street ?? undefined,
        city: r.city ?? undefined,
        zip: r.zip ?? undefined,
      })),
    );
    // A short page is the last page. Guarded against a runaway loop if the
    // server ever returns a full page forever.
    if (rows.length < PAGE || out.length > 500_000) break;
  }

  return out;
}
