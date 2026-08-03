"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { subscribeTable } from "../supabase/realtime";

const TABLE = "notes";

export interface Note {
  id: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  recipientIds: string[]; // employee ids this note has been shared/sent to
  createdAt: string;
  updatedAt: string;
}

interface Row { id: string; data: Note }
const fromRow = (row: Row): Note => ({ ...row.data, id: row.id });

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

async function fetchAll(): Promise<Note[]> {
  const { data, error } = await supabase.from(TABLE).select("id, data").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

export function subscribeNotes(cb: (notes: Note[]) => void) {
  return subscribeTable(TABLE, fetchAll, cb);
}

export function useNotes(): Note[] {
  const [list, setList] = useState<Note[]>([]);
  useEffect(() => subscribeNotes(setList), []);
  return list;
}

export async function addNote(note: Note): Promise<void> {
  const { error } = await withTimeout(
    supabase.from(TABLE).upsert({ id: note.id, author_id: note.authorId, updated_at: note.updatedAt, data: note })
  );
  if (error) throw error;
}

export async function updateNote(id: string, patch: Partial<Note>): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase.from(TABLE).select("data").eq("id", id).single();
  if (fetchErr) throw fetchErr;
  const merged: Note = { ...(existing.data as Note), ...patch };
  const { error } = await withTimeout(
    supabase.from(TABLE).update({ author_id: merged.authorId, updated_at: merged.updatedAt, data: merged }).eq("id", id)
  );
  if (error) throw error;
}

export async function removeNote(id: string): Promise<void> {
  const { error } = await withTimeout(supabase.from(TABLE).delete().eq("id", id));
  if (error) throw error;
}
