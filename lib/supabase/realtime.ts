"use client";

import { supabase } from "./client";

// Supabase's realtime client reuses a single channel object per topic name
// (see RealtimeClient.channel() — it returns the existing channel if one with
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

export function subscribeTable<T>(
  table: string,
  fetchAll: () => Promise<T[]>,
  cb: (rows: T[]) => void
): () => void {
  fetchAll().then(cb).catch((err) => console.error(`[${table}]`, err));

  let sub = subscriptions.get(table);
  if (!sub) {
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach((l) => l());
    const channel = supabase
      .channel(`${table}-all`)
      .on("postgres_changes", { event: "*", schema: "public", table }, notify)
      .subscribe();
    sub = { channel, listeners };
    subscriptions.set(table, sub);
  }

  const onChange = () => fetchAll().then(cb).catch((err) => console.error(`[${table}]`, err));
  sub.listeners.add(onChange);

  return () => {
    sub!.listeners.delete(onChange);
    if (sub!.listeners.size === 0) {
      supabase.removeChannel(sub!.channel);
      subscriptions.delete(table);
    }
  };
}
