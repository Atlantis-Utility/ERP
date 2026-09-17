"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";

const TABLE = "lead_activity";

export type LeadActivityKind = "created" | "stage" | "assigned" | "field" | "note" | "grant" | "import";

/**
 * Append-only trail of how a lead was worked, stage moves, reassignments,
 * field edits, access changes. Distinct from lead_notes: notes are the
 * author's private commentary, activity is the shared record, and a leads
 * admin can read all of it (see supabase/migration-record-access.sql).
 */
export interface LeadActivity {
  id: string;
  leadId: string;
  actorId: string | null;
  actorName: string | null;
  kind: LeadActivityKind;
  summary: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

interface Row {
  id: string;
  lead_id: string;
  actor_id: string | null;
  actor_name: string | null;
  kind: LeadActivityKind;
  summary: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

const fromRow = (row: Row): LeadActivity => ({
  id: row.id,
  leadId: row.lead_id,
  actorId: row.actor_id,
  actorName: row.actor_name,
  kind: row.kind,
  summary: row.summary,
  detail: row.detail ?? {},
  createdAt: row.created_at,
});

export interface ActivityActor {
  id: string;
  name: string;
}

export interface ActivityEntry {
  leadId: string;
  kind: LeadActivityKind;
  summary: string;
  detail?: Record<string, unknown>;
}

const COLUMNS = "id, lead_id, actor_id, actor_name, kind, summary, detail, created_at";

/**
 * Records activity, and never throws: an audit entry failing to write must
 * not roll back or appear to fail the user's actual edit, which has already
 * been committed by the time we get here. Failures are logged instead.
 */
export async function logActivity(entries: ActivityEntry[], actor: ActivityActor | null): Promise<void> {
  if (entries.length === 0) return;
  try {
    const { error } = await supabase.from(TABLE).insert(
      entries.map((e) => ({
        lead_id: e.leadId,
        actor_id: actor?.id || null,
        actor_name: actor?.name || null,
        kind: e.kind,
        summary: e.summary,
        detail: e.detail ?? {},
      })),
    );
    if (error) throw error;
  } catch (err) {
    console.warn("[lead_activity] failed to record activity:", err);
  }
}

/**
 * One lead's trail, newest first. Scoped to a single lead rather than the
 * whole-table-then-filter pattern used elsewhere in lib/db: activity grows
 * without bound (every edit to every lead forever), so syncing all of it to
 * every client would not stay viable.
 */
/** What a subscriber is handed: the rows plus the lead they belong to. */
export interface LeadActivitySnapshot {
  leadId: string;
  activity: LeadActivity[];
  error: string;
}

/**
 * Loads one lead's activity and keeps it live. Split out of the hook, the
 * same shape as subscribeTable in lib/supabase/realtime.ts, so the effect
 * below hands over a setter instead of calling it, and state only lands from
 * the async callback rather than synchronously during the effect.
 */
export function subscribeLeadActivity(leadId: string, cb: (snapshot: LeadActivitySnapshot) => void): () => void {
  let cancelled = false;

  const load = async () => {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select(COLUMNS)
        // Capped: a long-running lead accumulates activity indefinitely, and
        // the drawer only ever shows recent history.
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      if (!cancelled) cb({ leadId, activity: (data as Row[]).map(fromRow), error: "" });
    } catch (err) {
      console.error("[lead_activity]", err);
      if (!cancelled) cb({ leadId, activity: [], error: "Could not load activity." });
    }
  };

  load();

  // Per-lead channel name, so two drawers (or a drawer reopened on a
  // different lead) can't collide on one topic, lib/supabase/realtime.ts
  // documents why a shared topic name breaks when two callers subscribe.
  const channel = supabase
    .channel(`lead-activity-${leadId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `lead_id=eq.${leadId}` }, () => {
      if (!cancelled) load();
    })
    .subscribe();

  return () => {
    cancelled = true;
    supabase.removeChannel(channel);
  };
}

export function useLeadActivity(leadId: string | null): {
  activity: LeadActivity[];
  loading: boolean;
  error: string;
} {
  // One piece of state, tagged with the lead it belongs to, so `loading` is
  // derived rather than stored. That also fixes a real display bug: holding
  // `activity` in its own state left the previous lead's history on screen
  // while the next lead's was still in flight.
  const [loaded, setLoaded] = useState<LeadActivitySnapshot | null>(null);

  useEffect(() => {
    if (!leadId) return;
    return subscribeLeadActivity(leadId, setLoaded);
  }, [leadId]);

  const isCurrent = leadId !== null && loaded?.leadId === leadId;
  return {
    activity: isCurrent ? loaded.activity : [],
    loading: leadId !== null && !isCurrent,
    error: isCurrent ? loaded.error : "",
  };
}
