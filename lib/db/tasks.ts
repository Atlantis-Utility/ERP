"use client";

import { supabase } from "../supabase/client";
import { subscribeTable } from "../supabase/realtime";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";

const TABLE = "tasks"; // was Firestore "kanban_cards"

interface Row { id: string; data: KanbanCard }
const fromRow = (row: Row): KanbanCard => ({ ...row.data, id: row.id });

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

async function fetchAll(): Promise<KanbanCard[]> {
  const { data, error } = await supabase.from(TABLE).select("id, data").order("due_date");
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

export function subscribeTasks(cb: (cards: KanbanCard[]) => void) {
  return subscribeTable(TABLE, fetchAll, cb);
}

export async function addTask(card: KanbanCard): Promise<void> {
  // Upsert, not insert — ticket-derived cards (see TicketWatcher) can be
  // re-added for the same ticket id if a poll cycle races the realtime
  // "already synced" update, and that should be a harmless no-op rather
  // than a unique-constraint error.
  const { error } = await withTimeout(
    supabase.from(TABLE).upsert({ id: card.id, due_date: card.dueDate || null, data: card })
  );
  if (error) throw error;
}

export async function updateTask(id: string, patch: Partial<KanbanCard>): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase.from(TABLE).select("data").eq("id", id).single();
  if (fetchErr) throw fetchErr;
  const merged = { ...(existing.data as KanbanCard), ...patch };
  const { error } = await withTimeout(
    supabase.from(TABLE).update({ due_date: merged.dueDate || null, data: merged }).eq("id", id)
  );
  if (error) throw error;
}

export async function removeTask(id: string): Promise<void> {
  const { error } = await withTimeout(supabase.from(TABLE).delete().eq("id", id));
  if (error) throw error;
}
