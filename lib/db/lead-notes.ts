"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { subscribeTable } from "../supabase/realtime";

const TABLE = "lead_notes";

// Same private-by-default, shareable-with-teammates model as the personal
// Notes feature (lib/db/notes.ts): a note is visible to its author and to
// whoever's in recipientIds, enforced client-side (same as Notes), not by
// RLS, since Supabase policy here just requires an authenticated session.
export interface LeadNote {
  id: string;
  leadId: string;
  authorId: string;
  authorName: string;
  body: string;
  recipientIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface Row { id: string; data: LeadNote }
const fromRow = (row: Row): LeadNote => ({ ...row.data, id: row.id });

function withTimeout<T>(promise: PromiseLike<T>, ms = 12_000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Request timed out. Check your connection and try again.")),
        ms
      )
    ),
  ]);
}

async function fetchAll(): Promise<LeadNote[]> {
  const { data, error } = await supabase.from(TABLE).select("id, data").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

export function subscribeLeadNotes(cb: (notes: LeadNote[]) => void) {
  return subscribeTable(TABLE, fetchAll, cb);
}

// Loads every lead's notes (same "sync the table, filter client-side"
// pattern the rest of the app uses for tasks/notes/projects), the caller
// filters down to a specific leadId and to what the current user can see.
export function useLeadNotes(): LeadNote[] {
  const [list, setList] = useState<LeadNote[]>([]);
  useEffect(() => subscribeLeadNotes(setList), []);
  return list;
}

export async function addLeadNote(note: LeadNote): Promise<void> {
  const { error } = await withTimeout(
    supabase.from(TABLE).upsert({ id: note.id, updated_at: note.updatedAt, data: note })
  );
  if (error) throw error;
}

export async function updateLeadNote(id: string, patch: Partial<LeadNote>): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase.from(TABLE).select("data").eq("id", id).single();
  if (fetchErr) throw fetchErr;
  const merged: LeadNote = { ...(existing.data as LeadNote), ...patch, updatedAt: new Date().toISOString() };
  const { error } = await withTimeout(
    supabase.from(TABLE).update({ updated_at: merged.updatedAt, data: merged }).eq("id", id)
  );
  if (error) throw error;
}

export async function removeLeadNote(id: string): Promise<void> {
  const { error } = await withTimeout(supabase.from(TABLE).delete().eq("id", id));
  if (error) throw error;
}
