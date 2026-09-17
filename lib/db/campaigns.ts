"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { subscribeChanges } from "../supabase/realtime";
import { getErrorMessage } from "../utils";
import { STALE_DAYS, type LeadFilters } from "./leads";

/**
 * Campaigns: a named list of leads worked as a call sheet.
 *
 * Same shape as lib/db/leads.ts and for the same reasons, queried through
 * SQL functions a page at a time, with RLS scoping every call, rather than
 * synced whole. A campaign can hold thousands of rows.
 *
 * Requires supabase/migration-campaigns.sql.
 */

export type CampaignLevel = "admin" | "editor" | "viewer";
export type CampaignStatus = "active" | "paused" | "done";

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  createdByName: string | null;
  createdAt: string;
  leadCount: number;
  calledCount: number;
  /** null means the caller can't see it. RLS won't return those anyway. */
  myLevel: CampaignLevel | null;
}

/** One row of the sheet: lead facts (read-only) + call results (editable). */
export interface CampaignRow {
  rowId: string;
  leadId: string;
  position: number;
  companyName: string | null;
  contactName: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  source: string | null;
  callDate: string | null;
  callOutcome: string | null;
  callerFeedback: string | null;
  interestedIn: string | null;
  followUpDate: string | null;
  assignedRep: string | null;
  assignedRepName: string | null;
  attempts: number;
  bestTime: string | null;
  nextAction: string | null;
  doNotCall: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
  /**
   * Lead facts a campaign editor has corrected that are still waiting on an
   * administrator, keyed by the lead field. The sheet shows these in place of
   * the stored value and tags the row, so the person who typed a correction
   * sees their own work rather than the value they just replaced.
   */
  pending: Record<string, string | null>;
}

/** The editable half of a row, what a caller fills in. */
export type CampaignRowPatch = Partial<
  Pick<
    CampaignRow,
    | "callDate"
    | "callOutcome"
    | "callerFeedback"
    | "interestedIn"
    | "followUpDate"
    | "assignedRep"
    | "assignedRepName"
    | "attempts"
    | "bestTime"
    | "nextAction"
    | "doNotCall"
  >
>;

/** Criteria for picking which leads go into a campaign. */
export interface CampaignCriteria {
  search: string;
  status: string;
  assignedTo: string;
  priority: string;
  source: string;
  city: string;
  state: string;
  category: string;
  tag: string;
  unassignedOnly: boolean;
  /** Carried over from the Leads page's own toggles. */
  overdue: boolean;
  stale: boolean;
}

export const EMPTY_CRITERIA: CampaignCriteria = {
  search: "",
  status: "",
  assignedTo: "",
  priority: "",
  source: "",
  city: "",
  state: "",
  category: "",
  tag: "",
  unassignedOnly: false,
  overdue: false,
  stale: false,
};

/**
 * Translates the Leads page's filters into campaign criteria, for "add
 * everything matching these filters to a campaign".
 *
 * Every filter has to map across, including overdue and gone-quiet, which
 * the SQL predicate mirrors from leads_matches. A filter silently dropped
 * here would add leads the user had filtered out, which is the one mistake
 * a bulk action can't take back.
 */
export function criteriaFromLeadFilters(f: LeadFilters): CampaignCriteria {
  return {
    ...EMPTY_CRITERIA,
    search: f.search,
    status: f.status,
    // The leads table uses a sentinel for "no owner", which is a separate
    // flag on this side.
    assignedTo: f.assignedTo === "unassigned" ? "" : f.assignedTo,
    unassignedOnly: f.assignedTo === "unassigned",
    priority: f.priority,
    source: f.source,
    city: f.city,
    overdue: f.overdue,
    stale: f.stale,
  };
}

export interface CampaignRowFilters {
  search: string;
  rep: string;
  outcome: string;
  uncalled: boolean;
  due: boolean;
}

export const EMPTY_ROW_FILTERS: CampaignRowFilters = {
  search: "",
  rep: "",
  outcome: "",
  uncalled: false,
  due: false,
};

export interface CampaignStats {
  total: number;
  called: number;
  interested: number;
  followUps: number;
  unassigned: number;
  /** Rows carrying a correction that hasn't been reviewed yet. */
  pending: number;
  doNotCall: number;
}

function withTimeout<T>(promise: PromiseLike<T>, ms = 20_000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out. Check your connection and try again.")), ms),
    ),
  ]);
}

const MIGRATION_HINT =
  "Campaigns aren't installed yet. Run supabase/migration-campaigns.sql in the Supabase SQL editor, then reload.";

function campaignError(err: unknown, fallback: string): string {
  const code = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  const message = err && typeof err === "object" ? String((err as { message?: unknown }).message ?? "") : "";
  if (code === "PGRST202" || code === "42P01" || /could not find the function|does not exist/i.test(message)) {
    return MIGRATION_HINT;
  }
  return getErrorMessage(err, fallback);
}

const criteriaArgs = (c: CampaignCriteria) => ({
  p_search: c.search.trim() || null,
  p_status: c.status || null,
  p_assigned_to: c.assignedTo || null,
  p_priority: c.priority || null,
  p_source: c.source || null,
  p_city: c.city || null,
  p_state: c.state || null,
  p_category: c.category || null,
  p_tag: c.tag.trim() || null,
  p_unassigned_only: c.unassignedOnly,
  p_overdue: c.overdue,
  p_stale: c.stale,
  p_stale_days: STALE_DAYS,
});

/* ─── Campaign list ─────────────────────────────────────────────────────── */

interface CampaignRowRaw {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  created_by_name: string | null;
  created_at: string;
  lead_count: number;
  called_count: number;
  my_level: CampaignLevel | null;
}

const fromCampaignRow = (r: CampaignRowRaw): Campaign => ({
  id: r.id,
  name: r.name,
  description: r.description,
  status: r.status,
  createdByName: r.created_by_name,
  createdAt: r.created_at,
  leadCount: Number(r.lead_count ?? 0),
  calledCount: Number(r.called_count ?? 0),
  myLevel: r.my_level,
});

export async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await withTimeout(supabase.rpc("campaigns_list"));
  if (error) throw error;
  return ((data ?? []) as CampaignRowRaw[]).map(fromCampaignRow);
}

export interface CampaignsSnapshot {
  campaigns: Campaign[];
  loading: boolean;
  error: string;
}

/**
 * The campaign list, kept live. Watches three tables because all of them
 * change what the list shows: the campaigns themselves, the grants (which
 * decide what you can see), and the rows (which drive the counts). Debounced,
 * since adding 4,000 leads to a campaign fires an event per row.
 */
export function subscribeCampaigns(cb: (snapshot: CampaignsSnapshot) => void): () => void {
  let cancelled = false;

  const load = async () => {
    try {
      const campaigns = await fetchCampaigns();
      if (!cancelled) cb({ campaigns, loading: false, error: "" });
    } catch (err) {
      console.error("[campaigns]", err);
      if (!cancelled) {
        cb({ campaigns: [], loading: false, error: campaignError(err, "Failed to load campaigns") });
      }
    }
  };

  load();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const reload = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(load, 400);
  };

  // Shared and ref-counted, not a channel of its own: two components calling
  // useCampaigns() at once (the Campaigns page renders CampaignsPanel, and
  // both want the list) would otherwise have the second one add callbacks to
  // an already-subscribed channel, which throws and takes the page down.
  const unsubscribe = subscribeChanges("campaigns-list", ["campaigns", "campaign_grants", "campaign_leads"], reload);

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}

export function useCampaigns(): CampaignsSnapshot {
  const [snapshot, setSnapshot] = useState<CampaignsSnapshot>({
    campaigns: [],
    loading: true,
    error: "",
  });
  useEffect(() => subscribeCampaigns(setSnapshot), []);
  return snapshot;
}

/* ─── Campaign CRUD ─────────────────────────────────────────────────────── */

export interface NewCampaign {
  name: string;
  description?: string;
  createdBy?: string | null;
  createdByName?: string | null;
}

/** Creates the campaign and returns its id. Administrator-only at the DB. */
export async function createCampaign(input: NewCampaign): Promise<string> {
  const { data, error } = await withTimeout(
    supabase
      .from("campaigns")
      .insert({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        created_by: input.createdBy ?? null,
        created_by_name: input.createdByName ?? null,
      })
      .select("id")
      .single(),
  );
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateCampaign(
  id: string,
  patch: { name?: string; description?: string | null; status?: CampaignStatus },
): Promise<void> {
  const { error } = await withTimeout(
    supabase
      .from("campaigns")
      .update({
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id),
  );
  if (error) throw error;
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await withTimeout(supabase.from("campaigns").delete().eq("id", id));
  if (error) throw error;
}

/* ─── Filling a campaign ────────────────────────────────────────────────── */

/** Either specific leads, or everything matching a criteria set. */
export type CampaignFill =
  { kind: "ids"; ids: string[] } | { kind: "criteria"; criteria: CampaignCriteria; limit?: number };

/** Returns how many rows were actually added (already-present leads skipped). */
export async function addLeadsToCampaign(campaignId: string, fill: CampaignFill): Promise<number> {
  const args =
    fill.kind === "ids"
      ? { p_ids: fill.ids, ...criteriaArgs(EMPTY_CRITERIA), p_limit: null }
      : { p_ids: null, ...criteriaArgs(fill.criteria), p_limit: fill.limit ?? null };

  const { data, error } = await withTimeout(
    supabase.rpc("campaign_add_leads", { p_campaign_id: campaignId, ...args }),
    120_000,
  );
  if (error) throw error;
  return Number(data ?? 0);
}

export interface SelectionPreview {
  matching: number;
  alreadyAdded: number;
}

/** "This would add N leads (M already on the sheet)", before committing. */
export async function previewSelection(criteria: CampaignCriteria, campaignId?: string): Promise<SelectionPreview> {
  const { data, error } = await withTimeout(
    supabase.rpc("campaign_selection_count", {
      p_campaign_id: campaignId ?? null,
      ...criteriaArgs(criteria),
    }),
  );
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { matching: number; already_added: number } | undefined;
  return {
    matching: Number(row?.matching ?? 0),
    alreadyAdded: Number(row?.already_added ?? 0),
  };
}

export type LeadFacetField = "city" | "state" | "businessType" | "source" | "priority";

export interface LeadFacet {
  value: string;
  count: number;
}

/**
 * Distinct values with counts, for the criteria pickers and the Leads page's
 * city filter.
 *
 * Case variants are merged, because everything that *matches* on these
 * fields does so case-insensitively (leads_matches and
 * campaign_selection_matches both compare lower() to lower()). The SQL
 * groups by the stored text, so a bulk-imported "CONTRACTORS" and a
 * hand-typed "Contractors" arrive as two entries, and picking either one
 * returns the rows for both: the list showed the same value twice and each
 * count was short by the other's. Merged here rather than in SQL so the
 * function stays an honest report of what's stored.
 *
 * The label keeps the most common spelling, since that's the one that
 * matches how the rest of the list reads.
 */
export async function fetchLeadFieldValues(field: LeadFacetField): Promise<LeadFacet[]> {
  const { data, error } = await withTimeout(supabase.rpc("leads_field_values", { p_field: field, p_limit: 300 }));
  if (error) throw error;

  const merged = new Map<string, LeadFacet>();
  for (const row of (data ?? []) as { value: string; n: number }[]) {
    const key = row.value.toLowerCase();
    const count = Number(row.n);
    const seen = merged.get(key);
    if (!seen) {
      merged.set(key, { value: row.value, count });
      continue;
    }
    merged.set(key, {
      value: count > seen.count ? row.value : seen.value,
      count: seen.count + count,
    });
  }
  return [...merged.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/* ─── The sheet ─────────────────────────────────────────────────────────── */

interface SheetRowRaw {
  row_id: string;
  lead_id: string;
  /** The "No." column. Named row_no in SQL because POSITION is reserved. */
  row_no: number;
  company_name: string | null;
  contact_name: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  source: string | null;
  call_date: string | null;
  call_outcome: string | null;
  caller_feedback: string | null;
  interested_in: string | null;
  follow_up_date: string | null;
  assigned_rep: string | null;
  assigned_rep_name: string | null;
  attempts: number | null;
  best_time: string | null;
  next_action: string | null;
  do_not_call: boolean | null;
  updated_at: string | null;
  updated_by_name: string | null;
  pending: Record<string, string | null> | null;
}

const fromSheetRow = (r: SheetRowRaw): CampaignRow => ({
  rowId: r.row_id,
  leadId: r.lead_id,
  position: r.row_no,
  companyName: r.company_name,
  contactName: r.contact_name,
  address1: r.address1,
  city: r.city,
  state: r.state,
  zip: r.zip,
  phone: r.phone,
  email: r.email,
  category: r.category,
  source: r.source,
  callDate: r.call_date,
  callOutcome: r.call_outcome,
  callerFeedback: r.caller_feedback,
  interestedIn: r.interested_in,
  followUpDate: r.follow_up_date,
  assignedRep: r.assigned_rep,
  assignedRepName: r.assigned_rep_name,
  attempts: Number(r.attempts ?? 0),
  bestTime: r.best_time,
  nextAction: r.next_action,
  doNotCall: Boolean(r.do_not_call),
  updatedAt: r.updated_at,
  updatedByName: r.updated_by_name,
  pending: r.pending ?? {},
});

const rowFilterArgs = (f: CampaignRowFilters) => ({
  p_search: f.search.trim() || null,
  p_rep: f.rep || null,
  p_outcome: f.outcome || null,
  p_uncalled: f.uncalled,
  p_due: f.due,
});

export interface SheetQuery {
  campaignId: string;
  filters: CampaignRowFilters;
  page: number;
  pageSize: number;
}

export function sheetQueryKey(q: SheetQuery): string {
  return JSON.stringify([q.campaignId, q.filters, q.page, q.pageSize]);
}

export interface SheetResult {
  key: string;
  rows: CampaignRow[];
  stats: CampaignStats | null;
  error: string;
}

export async function fetchSheetRows(q: SheetQuery): Promise<CampaignRow[]> {
  const { data, error } = await withTimeout(
    supabase.rpc("campaign_rows", {
      p_campaign_id: q.campaignId,
      ...rowFilterArgs(q.filters),
      p_limit: q.pageSize,
      p_offset: q.page * q.pageSize,
    }),
  );
  if (error) throw error;
  return ((data ?? []) as SheetRowRaw[]).map(fromSheetRow);
}

export async function fetchCampaignStats(campaignId: string, filters: CampaignRowFilters): Promise<CampaignStats> {
  const { data, error } = await withTimeout(
    supabase.rpc("campaign_stats", { p_campaign_id: campaignId, ...rowFilterArgs(filters) }),
  );
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        total: number;
        called: number;
        interested: number;
        follow_ups: number;
        unassigned: number;
        do_not_call: number;
        pending: number;
      }
    | undefined;
  return {
    total: Number(row?.total ?? 0),
    called: Number(row?.called ?? 0),
    interested: Number(row?.interested ?? 0),
    followUps: Number(row?.follow_ups ?? 0),
    unassigned: Number(row?.unassigned ?? 0),
    pending: Number(row?.pending ?? 0),
    doNotCall: Number(row?.do_not_call ?? 0),
  };
}

/**
 * One page of the sheet plus its totals. "Start work, return a canceller" so
 * the calling effect hands over a setter instead of calling one.
 */
export function querySheet(q: SheetQuery, cb: (result: SheetResult) => void): () => void {
  let cancelled = false;
  const key = sheetQueryKey(q);

  (async () => {
    try {
      const [rows, stats] = await Promise.all([fetchSheetRows(q), fetchCampaignStats(q.campaignId, q.filters)]);
      if (!cancelled) cb({ key, rows, stats, error: "" });
    } catch (err) {
      console.error("[campaign_rows]", err);
      if (!cancelled) {
        cb({ key, rows: [], stats: null, error: campaignError(err, "Failed to load the sheet") });
      }
    }
  })();

  return () => {
    cancelled = true;
  };
}

const PATCH_COLUMNS: Record<keyof CampaignRowPatch, string> = {
  callDate: "call_date",
  callOutcome: "call_outcome",
  callerFeedback: "caller_feedback",
  interestedIn: "interested_in",
  followUpDate: "follow_up_date",
  assignedRep: "assigned_rep",
  assignedRepName: "assigned_rep_name",
  attempts: "attempts",
  bestTime: "best_time",
  nextAction: "next_action",
  doNotCall: "do_not_call",
};

/**
 * Saves one cell (or a few at once). Empty strings are written as NULL, not
 * "", so a cleared date column stops being a date rather than failing to
 * parse, and "has this been called?" stays a straight NULL check.
 */
export async function updateSheetRow(
  rowId: string,
  patch: CampaignRowPatch,
  actor?: { id: string; name: string } | null,
): Promise<void> {
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: actor?.id ?? null,
    updated_by_name: actor?.name ?? null,
  };
  for (const [key, column] of Object.entries(PATCH_COLUMNS) as [keyof CampaignRowPatch, string][]) {
    if (patch[key] === undefined) continue;
    const value = patch[key];
    update[column] = typeof value === "string" && value.trim() === "" ? null : value;
  }

  const { error } = await withTimeout(supabase.from("campaign_leads").update(update).eq("id", rowId));
  if (error) throw error;
}

export async function removeSheetRows(rowIds: string[]): Promise<void> {
  if (rowIds.length === 0) return;
  const CHUNK = 200;
  for (let i = 0; i < rowIds.length; i += CHUNK) {
    const { error } = await withTimeout(
      supabase
        .from("campaign_leads")
        .delete()
        .in("id", rowIds.slice(i, i + CHUNK)),
      30_000,
    );
    if (error) throw error;
  }
}

/** Closes gaps in the No. column. Returns how many rows moved. */
export async function renumberCampaign(campaignId: string): Promise<number> {
  const { data, error } = await withTimeout(supabase.rpc("campaign_renumber", { p_campaign_id: campaignId }), 60_000);
  if (error) throw error;
  return Number(data ?? 0);
}

/* ─── Campaign access ───────────────────────────────────────────────────── */

export interface CampaignGrant {
  id: string;
  campaignId: string;
  employeeId: string;
  level: "editor" | "viewer";
  grantedByName: string | null;
  grantedAt: string;
}

interface GrantRowRaw {
  id: string;
  campaign_id: string;
  employee_id: string;
  level: "editor" | "viewer";
  granted_by_name: string | null;
  granted_at: string;
}

const GRANT_COLUMNS = "id, campaign_id, employee_id, level, granted_by_name, granted_at";

const fromGrantRow = (r: GrantRowRaw): CampaignGrant => ({
  id: r.id,
  campaignId: r.campaign_id,
  employeeId: r.employee_id,
  level: r.level,
  grantedByName: r.granted_by_name,
  grantedAt: r.granted_at,
});

export async function fetchCampaignGrants(campaignId: string): Promise<CampaignGrant[]> {
  const { data, error } = await withTimeout(
    supabase.from("campaign_grants").select(GRANT_COLUMNS).eq("campaign_id", campaignId).order("granted_at"),
  );
  if (error) throw error;
  return (data as GrantRowRaw[]).map(fromGrantRow);
}

export function subscribeCampaignGrants(campaignId: string, cb: (grants: CampaignGrant[]) => void): () => void {
  let cancelled = false;

  const load = async () => {
    try {
      const grants = await fetchCampaignGrants(campaignId);
      if (!cancelled) cb(grants);
    } catch (err) {
      console.error("[campaign_grants]", err);
    }
  };

  load();

  // Watches every grant rather than filtering to this campaign's: the filter
  // was the only thing this channel gained by being its own, and sharing it
  // is worth more than the few extra reloads, since a grant change anywhere
  // is rare. Ref-counted for the same reason as the list above.
  const unsubscribe = subscribeChanges(`campaign-grants-${campaignId}`, ["campaign_grants"], () => {
    if (!cancelled) load();
  });

  return () => {
    cancelled = true;
    unsubscribe();
  };
}

export function useCampaignGrants(campaignId: string): CampaignGrant[] {
  const [grants, setGrants] = useState<CampaignGrant[]>([]);
  useEffect(() => subscribeCampaignGrants(campaignId, setGrants), [campaignId]);
  return grants;
}

/**
 * Grants or re-levels access. Delete-then-insert so re-granting at a
 * different level replaces the row instead of colliding on the unique key.
 */
export async function grantCampaignAccess(
  campaignId: string,
  employeeId: string,
  level: "editor" | "viewer",
  actor?: { id: string; name: string } | null,
): Promise<void> {
  const { error: delError } = await withTimeout(
    supabase.from("campaign_grants").delete().eq("campaign_id", campaignId).eq("employee_id", employeeId),
  );
  if (delError) throw delError;

  const { error } = await withTimeout(
    supabase.from("campaign_grants").insert({
      campaign_id: campaignId,
      employee_id: employeeId,
      level,
      granted_by: actor?.id ?? null,
      granted_by_name: actor?.name ?? null,
    }),
  );
  if (error) throw error;
}

export async function revokeCampaignGrant(grantId: string): Promise<void> {
  const { error } = await withTimeout(supabase.from("campaign_grants").delete().eq("id", grantId));
  if (error) throw error;
}
