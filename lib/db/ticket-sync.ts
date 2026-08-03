import { supabase } from "../supabase/client";

// Tracks which live-fetched email tickets (from Graph, never persisted elsewhere)
// have already been turned into a task / notification, so the diff survives
// page reloads and is shared across every logged-in browser.
const TABLE = "ticket_sync";
const BASELINE_KEY = "ticket_sync_baseline";

export function subscribeSyncedTicketIds(cb: (ids: Set<string>) => void): () => void {
  function load() {
    supabase.from(TABLE).select("id").then(({ data, error }) => {
      if (error) { console.error("[ticket-sync]", error); return; }
      cb(new Set((data ?? []).map((r) => r.id as string)));
    });
  }
  load();

  const channel = supabase
    .channel("ticket-sync-all")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, load)
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export async function markTicketSynced(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert({ id, synced_at: new Date().toISOString() });
  if (error) throw error;
}

/** False only the very first time this runs — lets the caller seed whatever
 *  tickets already exist in the inbox as "already seen" instead of treating
 *  the entire inbox history as brand new. */
export async function isBaselineSeeded(): Promise<boolean> {
  const { data, error } = await supabase.from("settings").select("key").eq("key", BASELINE_KEY).maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function markBaselineSeeded(): Promise<void> {
  const { error } = await supabase
    .from("settings")
    .upsert({ key: BASELINE_KEY, value: { seededAt: new Date().toISOString() } });
  if (error) throw error;
}
