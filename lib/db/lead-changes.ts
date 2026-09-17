"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { getErrorMessage } from "../utils";

/**
 * Corrections proposed from a campaign sheet.
 *
 * A campaign editor works from the phone: they hear that a company changed
 * its name, that a number reaches the wrong desk, that an address is two
 * doors down. Letting them write that straight onto the lead would mean a
 * shared sheet could rewrite the lead database; refusing the edit means the
 * correction is lost, or ends up in a feedback box nobody reads.
 *
 * So the edit is recorded as a request, the row is tagged, and an
 * administrator sees before and after and decides. An administrator editing
 * the same cell writes through immediately, since they are the reviewer.
 *
 * Enforced in SQL (supabase/migration-campaign-approvals.sql): the submit
 * function checks campaign rights, and approval is administrator-only.
 */

/** Lead fields a campaign editor may propose a change to. */
export const EDITABLE_LEAD_FIELDS = [
  "companyName",
  "dba",
  "pocName",
  "pocTitle",
  "phone",
  "email",
  "website",
  "street",
  "city",
  "state",
  "zip",
  "businessType",
  "description",
] as const;

export type EditableLeadField = (typeof EDITABLE_LEAD_FIELDS)[number];

export const LEAD_FIELD_LABELS: Record<EditableLeadField, string> = {
  companyName: "Company name",
  dba: "DBA",
  pocName: "Contact name",
  pocTitle: "Title",
  phone: "Phone",
  email: "Email",
  website: "Website",
  street: "Address",
  city: "City",
  state: "State",
  zip: "Zip",
  businessType: "Category",
  description: "Description",
};

/**
 * How many requests one look at the queue loads. Kept below PostgREST's
 * 1000-row ceiling, which truncates a response silently, so a longer queue
 * is reported as a first page rather than quietly cut off.
 */
export const PENDING_PAGE_SIZE = 500;

export interface LeadChangeRequest {
  id: string;
  leadId: string;
  campaignId: string | null;
  campaignName: string | null;
  companyName: string | null;
  field: EditableLeadField;
  oldValue: string | null;
  newValue: string | null;
  requestedByName: string | null;
  requestedAt: string;
}

/** What happened to a proposed edit. */
export type ChangeOutcome = "pending" | "applied" | "unchanged";

function withTimeout<T>(promise: PromiseLike<T>, ms = 20_000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out. Check your connection and try again.")), ms),
    ),
  ]);
}

const MIGRATION_HINT =
  "Campaign edit review isn't installed yet. Run supabase/migration-campaign-approvals.sql in the Supabase SQL editor, then reload.";

export function changesError(err: unknown, fallback: string): string {
  const code = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  if (code === "PGRST202") return MIGRATION_HINT;
  return getErrorMessage(err, fallback);
}

/**
 * Proposes a correction to a lead fact from a campaign sheet. Returns what
 * the database did with it: queued for review, written straight through
 * (administrator), or discarded because it matched what was already there.
 */
export async function requestLeadChange(
  campaignId: string,
  leadId: string,
  field: EditableLeadField,
  newValue: string,
): Promise<ChangeOutcome> {
  const { data, error } = await withTimeout(
    supabase.rpc("campaign_request_change", {
      p_campaign_id: campaignId,
      p_lead_id: leadId,
      p_field: field,
      p_new_value: newValue,
    }),
  );
  if (error) throw error;
  return (data as ChangeOutcome) ?? "pending";
}

interface RawRequest {
  id: string;
  lead_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  company_name: string | null;
  field: string;
  old_value: string | null;
  new_value: string | null;
  requested_by_name: string | null;
  requested_at: string;
}

export async function fetchPendingChanges(campaignId?: string): Promise<LeadChangeRequest[]> {
  const { data, error } = await withTimeout(
    supabase.rpc("lead_changes_pending", { p_campaign_id: campaignId ?? null, p_limit: PENDING_PAGE_SIZE }),
  );
  if (error) throw error;
  return ((data ?? []) as RawRequest[]).map((r) => ({
    id: r.id,
    leadId: r.lead_id,
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    companyName: r.company_name,
    field: r.field as EditableLeadField,
    oldValue: r.old_value,
    newValue: r.new_value,
    requestedByName: r.requested_by_name,
    requestedAt: r.requested_at,
  }));
}

export async function countPendingChanges(campaignId?: string): Promise<number> {
  const { data, error } = await withTimeout(
    supabase.rpc("lead_changes_pending_count", { p_campaign_id: campaignId ?? null }),
  );
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Approves specific requests, or every request on a campaign when no ids are
 * given, which is what "Approve all" does. Returns how many were applied, so
 * a reviewer who has lost a race sees the real number rather than a false
 * success.
 */
export async function approveLeadChanges(ids: string[] | null, campaignId?: string): Promise<number> {
  const { data, error } = await withTimeout(
    supabase.rpc("lead_changes_approve", { p_ids: ids, p_campaign_id: campaignId ?? null }),
  );
  if (error) throw error;
  return Number(data ?? 0);
}

export async function rejectLeadChanges(ids: string[] | null, campaignId?: string): Promise<number> {
  const { data, error } = await withTimeout(
    supabase.rpc("lead_changes_reject", { p_ids: ids, p_campaign_id: campaignId ?? null }),
  );
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * How many corrections are waiting, for the badge on the campaign list. An
 * administrator gets the review queue, anyone else gets their own
 * outstanding requests.
 */
export function usePendingChangeCount(campaignId?: string): { count: number; reload: () => void } {
  const [count, setCount] = useState(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    countPendingChanges(campaignId)
      .then((n) => {
        if (!cancelled) setCount(n);
      })
      // A missing function (the migration hasn't been run) is not worth an
      // error here: the badge simply doesn't appear.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [campaignId, nonce]);

  return { count, reload: () => setNonce((n) => n + 1) };
}
