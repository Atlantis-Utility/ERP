"use client";

import { supabase } from "../supabase/client";
import { subscribeTable } from "../supabase/realtime";
import { selectAll } from "../supabase/select-all";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";

const TABLE = "tasks"; // was Firestore "kanban_cards"

interface Row {
  id: string;
  data: KanbanCard;
}
const fromRow = (row: Row): KanbanCard => ({ ...row.data, id: row.id });

function withTimeout<T>(promise: PromiseLike<T>, ms = 12_000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out. Check your connection and try again.")), ms),
    ),
  ]);
}

// Paged rather than a single select: PostgREST silently truncates at 1000
// rows (see lib/supabase/select-all.ts), which would quietly drop the oldest
// tasks off the board once the table crosses that line. Which rows come back
// at all is decided by RLS, administrators get every task, everyone else
// gets the ones they're assigned to or created
// (supabase/migration-record-access.sql).
async function fetchAll(): Promise<KanbanCard[]> {
  const rows = await selectAll<Row>(TABLE, "id, data", { orderBy: "due_date", ascending: true });
  return rows.map(fromRow);
}

export function subscribeTasks(cb: (cards: KanbanCard[]) => void) {
  return subscribeTable(TABLE, fetchAll, cb);
}

export async function addTask(card: KanbanCard): Promise<void> {
  // Upsert, not insert, ticket-derived cards (see TicketWatcher) can be
  // re-added for the same ticket id if a poll cycle races the realtime
  // "already synced" update, and that should be a harmless no-op rather
  // than a unique-constraint error.
  const { error } = await withTimeout(
    supabase.from(TABLE).upsert({ id: card.id, due_date: card.dueDate || null, data: card }),
  );
  if (error) throw error;
}

export async function updateTask(id: string, patch: Partial<KanbanCard>): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase.from(TABLE).select("data").eq("id", id).single();
  if (fetchErr) throw fetchErr;
  const current = existing.data as KanbanCard;

  // A move is stamped with when it happened, wherever it came from: a drag on
  // the board, the column picker in the detail drawer, the calendar. The
  // board compares this against the ticket's own updatedAt to decide which
  // wins for a ticket-derived card, and an unstamped move loses, so stamping
  // it here rather than at each call site is the difference between a move
  // that sticks and one that is silently undone on the next render. The
  // drawer's was being undone exactly that way.
  //
  // Only when the column actually changes: the drawer sends the whole form on
  // every save, and an edit to the title shouldn't freeze the column against
  // a later change to the ticket.
  const moved = patch.column !== undefined && patch.column !== current.column;
  const stamped =
    moved && patch.columnSetAt === undefined ? { ...patch, columnSetAt: new Date().toISOString() } : patch;

  const merged = { ...current, ...stamped };
  const { error } = await withTimeout(
    supabase
      .from(TABLE)
      .update({ due_date: merged.dueDate || null, data: merged })
      .eq("id", id),
  );
  if (error) throw error;
}

export async function removeTask(id: string): Promise<void> {
  const { error } = await withTimeout(supabase.from(TABLE).delete().eq("id", id));
  if (error) throw error;
}
