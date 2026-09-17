"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { subscribeTable } from "../supabase/realtime";
import { logActivity, type ActivityActor } from "./lead-activity";
import { bulkTargetArgs, type BulkTarget } from "./leads";

const TABLE = "lead_grants";

/**
 * 'editor', can work the lead exactly like its assignee.
 * 'viewer', read-only: sees the lead, can't change anything on it.
 */
export type LeadGrantLevel = "editor" | "viewer";

export interface LeadGrant {
  id: string;
  /** null means the grant covers every lead, not one specific lead. */
  leadId: string | null;
  employeeId: string;
  level: LeadGrantLevel;
  grantedBy: string | null;
  grantedByName: string | null;
  grantedAt: string;
}

interface Row {
  id: string;
  lead_id: string | null;
  employee_id: string;
  level: LeadGrantLevel;
  granted_by: string | null;
  granted_by_name: string | null;
  granted_at: string;
}

const COLUMNS = "id, lead_id, employee_id, level, granted_by, granted_by_name, granted_at";

const fromRow = (row: Row): LeadGrant => ({
  id: row.id,
  leadId: row.lead_id,
  employeeId: row.employee_id,
  level: row.level,
  grantedBy: row.granted_by,
  grantedByName: row.granted_by_name,
  grantedAt: row.granted_at,
});

function withTimeout<T>(promise: PromiseLike<T>, ms = 12_000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out. Check your connection and try again.")), ms),
    ),
  ]);
}

/**
 * All-leads grants only ("this person can see every lead"). At most one
 * row per employee, so this is safe to sync and subscribe to.
 *
 * Deliberately NOT "every grant": per-lead grants are unbounded, sharing a
 * 10,000-lead filter creates 10,000 rows, so nothing loads them all. Row
 * level rights arrive with each lead instead (Lead.accessLevel), and the
 * per-lead grant list is fetched one lead at a time below.
 */
async function fetchGlobalGrants(): Promise<LeadGrant[]> {
  const { data, error } = await withTimeout(
    supabase.from(TABLE).select(COLUMNS).is("lead_id", null).order("granted_at"),
  );
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

export function subscribeGlobalLeadGrants(cb: (grants: LeadGrant[]) => void) {
  return subscribeTable(`${TABLE}:global`, fetchGlobalGrants, cb, TABLE);
}

export function useGlobalLeadGrants(): LeadGrant[] {
  const [list, setList] = useState<LeadGrant[]>([]);
  useEffect(() => subscribeGlobalLeadGrants(setList), []);
  return list;
}

/** Everyone explicitly shared into one specific lead. */
export async function fetchLeadGrants(leadId: string): Promise<LeadGrant[]> {
  const { data, error } = await withTimeout(
    supabase.from(TABLE).select(COLUMNS).eq("lead_id", leadId).order("granted_at"),
  );
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

export function subscribeLeadGrantsFor(leadId: string, cb: (grants: LeadGrant[]) => void) {
  return subscribeTable(`${TABLE}:${leadId}`, () => fetchLeadGrants(leadId), cb, TABLE);
}

export function useLeadGrantsFor(leadId: string): LeadGrant[] {
  const [list, setList] = useState<LeadGrant[]>([]);
  useEffect(() => subscribeLeadGrantsFor(leadId, setList), [leadId]);
  return list;
}

/** How many individual leads each person has been shared into. */
export async function fetchGrantCounts(): Promise<Map<string, number>> {
  const { data, error } = await withTimeout(supabase.rpc("leads_grant_counts"));
  if (error) throw error;
  return new Map(((data ?? []) as { employee_id: string; n: number }[]).map((r) => [r.employee_id, Number(r.n)]));
}

export interface GrantInput {
  /** null grants access to every lead. */
  leadId: string | null;
  employeeId: string;
  level: LeadGrantLevel;
}

/**
 * Grants (or re-levels) access. Written as delete-then-insert rather than an
 * upsert because the uniqueness is enforced by two *partial* indexes, one
 * for per-lead grants, one for the org-wide grant, and ON CONFLICT can't
 * infer a partial index through PostgREST. Re-granting at a different level
 * therefore replaces the old row instead of erroring on the unique index.
 *
 * Only an administrator can do this; the policy on lead_grants enforces it,
 * so a member calling this gets a permission error rather than a silent no-op.
 */
export async function grantLeadAccess(input: GrantInput, actor?: ActivityActor | null): Promise<void> {
  await revokeMatching(input.leadId, input.employeeId);

  const { error } = await withTimeout(
    supabase.from(TABLE).insert({
      lead_id: input.leadId,
      employee_id: input.employeeId,
      level: input.level,
      granted_by: actor?.id || null,
      granted_by_name: actor?.name || null,
    }),
  );
  if (error) throw error;

  if (input.leadId) {
    await logActivity(
      [
        {
          leadId: input.leadId,
          kind: "grant",
          summary: `${input.level === "viewer" ? "Read-only" : "Edit"} access granted`,
          detail: { employeeId: input.employeeId, level: input.level },
        },
      ],
      actor ?? null,
    );
  }
}

/**
 * Grants the same access across many leads, the bulk "share these" flow.
 *
 * Done in the database (leads_apply_grant) rather than as a delete-then-insert
 * loop from the browser: sharing everything matching a filter can cover ten
 * thousand leads, which is one statement server-side and would otherwise be
 * a hundred round trips. Returns how many grants were actually created, * leads the person already owns are skipped, since the owner already has
 * full access.
 */
export async function grantLeadAccessBulk(
  target: BulkTarget,
  employeeId: string,
  level: LeadGrantLevel,
  actor?: ActivityActor | null,
): Promise<number> {
  const { data, error } = await withTimeout(
    supabase.rpc("leads_apply_grant", {
      p_employee_id: employeeId,
      p_level: level,
      p_granted_by: actor?.id ?? null,
      p_granted_by_name: actor?.name ?? null,
      ...bulkTargetArgs(target),
    }),
    120_000,
  );
  if (error) throw error;
  return Number(data ?? 0);
}

async function revokeMatching(leadId: string | null, employeeId: string): Promise<void> {
  const base = supabase.from(TABLE).delete().eq("employee_id", employeeId);
  // .eq() can't express "IS NULL", an org-wide grant has lead_id null, and
  // `lead_id=eq.null` matches nothing in PostgREST.
  const { error } = await withTimeout(leadId === null ? base.is("lead_id", null) : base.eq("lead_id", leadId));
  if (error) throw error;
}

export async function revokeLeadGrant(grant: LeadGrant, actor?: ActivityActor | null): Promise<void> {
  const { error } = await withTimeout(supabase.from(TABLE).delete().eq("id", grant.id));
  if (error) throw error;

  if (grant.leadId) {
    await logActivity(
      [
        {
          leadId: grant.leadId,
          kind: "grant",
          summary: "Access revoked",
          detail: { employeeId: grant.employeeId, level: grant.level },
        },
      ],
      actor ?? null,
    );
  }
}
