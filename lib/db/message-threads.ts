"use client";

import { supabase } from "../supabase/client";

/**
 * Our own notes and tags on a text conversation.
 *
 * The messages stay in RingLogix; this is the context around them, keyed
 * by the PBX's session id. Everything is optional - a thread with no row
 * behaves exactly as it did before this existed - so every read here
 * tolerates the table being absent and returns nothing rather than
 * throwing a page away over an annotation.
 */
const TABLE = "message_threads";

export interface ThreadAnnotation {
  sessionId: string;
  domain: string;
  notes: string;
  tags: string[];
  updatedAt: string;
  updatedBy: string;
}

function fromRow(row: Record<string, unknown>): ThreadAnnotation {
  return {
    sessionId: row.session_id as string,
    domain: (row.domain as string) ?? "",
    notes: (row.notes as string) ?? "",
    tags: ((row.tags as string[]) ?? []).filter(Boolean),
    updatedAt: (row.updated_at as string) ?? "",
    updatedBy: (row.updated_by as string) ?? "",
  };
}

/** Every annotation, as a map by session id. */
export async function listThreadAnnotations(): Promise<Record<string, ThreadAnnotation>> {
  const { data, error } = await supabase.from(TABLE).select("*");
  if (error || !data) return {};
  const out: Record<string, ThreadAnnotation> = {};
  for (const row of data as Record<string, unknown>[]) {
    const a = fromRow(row);
    out[a.sessionId] = a;
  }
  return out;
}

/**
 * Writes notes and/or tags for one thread.
 *
 * An upsert, because the common case is the first annotation a thread has
 * ever had and nobody should have to create the row first.
 */
export async function saveThreadAnnotation(
  sessionId: string,
  patch: { notes?: string; tags?: string[]; domain?: string },
  updatedBy: string,
): Promise<ThreadAnnotation | null> {
  const row: Record<string, unknown> = {
    session_id: sessionId,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.domain !== undefined) row.domain = patch.domain;

  const { data, error } = await supabase.from(TABLE).upsert(row).select().single();
  if (error || !data) return null;
  return fromRow(data as Record<string, unknown>);
}
