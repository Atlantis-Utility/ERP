"use client";

import { supabase } from "./client";

// Supabase's realtime client reuses a single channel object per topic name
// (see RealtimeClient.channel(), it returns the existing channel if one with
// the same topic already exists). That means if two components independently
// call `subscribeX()` for the same table around the same time, the second
// call's `.on()` lands on a channel that's already `.subscribe()`d and throws
// "cannot add `postgres_changes` callbacks ... after `subscribe()`". This
// happens in practice: e.g. the tasks page renders AddTaskDrawer, AddMeetingDrawer,
// and TaskDetailDrawer together, each calling useEmployees() on mount.
//
// Fix: share one real channel per table across all callers, ref-counted so it
// tears down once the last subscriber unmounts.
const subscriptions = new Map<string, { channel: ReturnType<typeof supabase.channel>; listeners: Set<() => void> }>();

// Every table here is behind an `auth.role() = 'authenticated'` RLS policy, and
// a SELECT that misses it comes back as zero rows with NO error, indis-
// tinguishable from a genuinely empty table. So a fetch issued before the
// session is restored (or while it's being refreshed) silently reports "there
// is nothing here", and callers dutifully render an empty page and write that
// emptiness into their localStorage cache, which then survives the reload.
//
// That's the tasks board filling in from cache and then blanking a moment
// later. Waiting for a session first keeps a missing token from being read as
// a missing row: a real empty table still publishes, an unauthenticated one
// no longer does.
async function hasSession(): Promise<boolean> {
  // getSession() returns the persisted session and refreshes it if expired.
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;

  // Not signed in *yet*, a page can mount before the session is rehydrated.
  // Wait briefly for the next auth event rather than publishing a false empty.
  return new Promise<boolean>((resolve) => {
    // `unsubscribe` is assigned after onAuthStateChange returns, but the
    // callback can in principle fire before that, so finish() tolerates it
    // being unset rather than throwing on a temporal-dead-zone reference.
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
      resolve(value);
    };

    timer = setTimeout(() => finish(false), 10_000);
    const listener = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(true);
    });
    unsubscribe = () => listener.data.subscription.unsubscribe();
    // Covers the callback having already fired synchronously above.
    if (settled) unsubscribe();
  });
}

/**
 * @param key       Identifies this subscription. Callers that watch the same
 *                  table with *different* queries (e.g. lead_grants scoped to
 *                  one lead vs. the all-leads ones) must pass distinct
 *                  keys, or they'd share one channel and one fetcher and
 *                  overwrite each other's results.
 * @param watchTable The Postgres table to listen on. Defaults to `key`, which
 *                  is the right thing when the key *is* a table name.
 */
export function subscribeTable<T>(
  key: string,
  fetchAll: () => Promise<T[]>,
  cb: (rows: T[]) => void,
  watchTable?: string,
): () => void {
  const table = key;
  let cancelled = false;

  const load = async () => {
    try {
      if (!(await hasSession())) return;
      const rows = await fetchAll();
      if (!cancelled) cb(rows);
    } catch (err) {
      console.error(`[${table}]`, err);
    }
  };

  load();

  let sub = subscriptions.get(table);
  if (!sub) {
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach((l) => l());
    const channel = supabase
      .channel(`${table}-all`)
      .on("postgres_changes", { event: "*", schema: "public", table: watchTable ?? table }, notify)
      .subscribe();
    sub = { channel, listeners };
    subscriptions.set(table, sub);
  }

  const onChange = () => {
    load();
  };
  sub.listeners.add(onChange);

  return () => {
    cancelled = true;
    sub!.listeners.delete(onChange);
    if (sub!.listeners.size === 0) {
      supabase.removeChannel(sub!.channel);
      subscriptions.delete(table);
    }
  };
}
