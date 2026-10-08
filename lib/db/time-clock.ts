"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { subscribeChanges } from "../supabase/realtime";

/**
 * Clocking in and out.
 *
 * A shift is one row: when it started, and when it ended. The one that
 * hasn't ended is the shift somebody is on right now, which is why "am I
 * clocked in?" is a query for a row with no clocked_out rather than a flag
 * anywhere.
 *
 * Hours are never stored, only derived — a stored total is one more thing
 * that can disagree with the two timestamps it came from.
 *
 * Requires supabase/migration-time-clock.sql.
 */
export interface Shift {
  id: string;
  employeeId: string;
  clockedIn: string;
  clockedOut: string | null;
  note: string | null;
  updatedByName: string | null;
}

interface Row {
  id: string;
  employee_id: string;
  clocked_in: string;
  clocked_out: string | null;
  note: string | null;
  updated_by_name: string | null;
}

const fromRow = (r: Row): Shift => ({
  id: r.id,
  employeeId: r.employee_id,
  clockedIn: r.clocked_in,
  clockedOut: r.clocked_out,
  note: r.note,
  updatedByName: r.updated_by_name,
});

const TABLE = "time_entries";

function withTimeout<T>(promise: PromiseLike<T>, ms = 20_000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("The server is taking longer than expected. Please try again.")), ms),
    ),
  ]);
}

/** Seconds on the clock. An open shift counts up to now. */
export function shiftSeconds(shift: Shift, now = Date.now()): number {
  const start = Date.parse(shift.clockedIn);
  const end = shift.clockedOut ? Date.parse(shift.clockedOut) : now;
  return Math.max(0, Math.round((end - start) / 1000));
}

/** "7h 42m", or "48m" under an hour — a timesheet reads in hours, not 7.7. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

/** Midnight this morning, in the browser's own timezone. */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Monday, because a working week starts on one. */
export function startOfWeek(): Date {
  const d = startOfToday();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

export async function clockIn(employeeId: string, note?: string): Promise<void> {
  const { error } = await withTimeout(
    supabase.from(TABLE).insert({ employee_id: employeeId, note: note?.trim() || null }),
  );
  // The database allows one open shift per person; a second tap, a second
  // tab or a replayed click lands here.
  if (error) {
    throw new Error(
      /one_open_per_employee|duplicate key/i.test(error.message)
        ? "You're already clocked in."
        : error.message,
    );
  }
}

export async function clockOut(shiftId: string, actor?: { id: string; name: string } | null): Promise<void> {
  const { error } = await withTimeout(
    supabase
      .from(TABLE)
      .update({
        clocked_out: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: actor?.id ?? null,
        updated_by_name: actor?.name ?? null,
      })
      .eq("id", shiftId)
      .is("clocked_out", null),
  );
  if (error) throw error;
}

/** An administrator correcting a shift somebody forgot to close. */
export async function amendShift(
  shiftId: string,
  patch: { clockedIn?: string; clockedOut?: string | null; note?: string | null },
  actor?: { id: string; name: string } | null,
): Promise<void> {
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: actor?.id ?? null,
    updated_by_name: actor?.name ?? null,
  };
  if (patch.clockedIn !== undefined) update.clocked_in = patch.clockedIn;
  if (patch.clockedOut !== undefined) update.clocked_out = patch.clockedOut;
  if (patch.note !== undefined) update.note = patch.note?.trim() || null;
  const { error } = await withTimeout(supabase.from(TABLE).update(update).eq("id", shiftId));
  if (error) throw error;
}

export async function removeShift(shiftId: string): Promise<void> {
  const { error } = await withTimeout(supabase.from(TABLE).delete().eq("id", shiftId));
  if (error) throw error;
}

export async function fetchShifts(opts: { from?: Date; to?: Date; employeeId?: string } = {}): Promise<Shift[]> {
  let query = supabase
    .from(TABLE)
    .select("id, employee_id, clocked_in, clocked_out, note, updated_by_name")
    .order("clocked_in", { ascending: false });
  if (opts.from) query = query.gte("clocked_in", opts.from.toISOString());
  if (opts.to) query = query.lt("clocked_in", opts.to.toISOString());
  if (opts.employeeId) query = query.eq("employee_id", opts.employeeId);
  const { data, error } = await withTimeout(query.limit(1000));
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

export interface ShiftsState {
  shifts: Shift[];
  loading: boolean;
  error: string;
}

/**
 * Shifts in a window, kept live. Realtime because two people watch this at
 * once: whoever is clocking in, and whoever is looking at who's in.
 */
export function useShifts(opts: { from?: Date; to?: Date; employeeId?: string } = {}): ShiftsState {
  const [state, setState] = useState<ShiftsState>({ shifts: [], loading: true, error: "" });
  const fromKey = opts.from?.toISOString() ?? "";
  const toKey = opts.to?.toISOString() ?? "";
  const who = opts.employeeId ?? "";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const shifts = await fetchShifts({
          from: fromKey ? new Date(fromKey) : undefined,
          to: toKey ? new Date(toKey) : undefined,
          employeeId: who || undefined,
        });
        if (!cancelled) setState({ shifts, loading: false, error: "" });
      } catch (err) {
        if (!cancelled) {
          setState({
            shifts: [],
            loading: false,
            error: err instanceof Error ? err.message : "Couldn't load the time clock",
          });
        }
      }
    };
    load();
    const unsubscribe = subscribeChanges("time-entries", [TABLE], load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [fromKey, toKey, who]);

  return state;
}

/** The shift somebody is on right now, if they're on one. */
export function openShift(shifts: Shift[], employeeId: string | null): Shift | null {
  if (!employeeId) return null;
  return shifts.find((s) => s.employeeId === employeeId && !s.clockedOut) ?? null;
}

/** Total seconds across a set of shifts. */
export function totalSeconds(shifts: Shift[], now = Date.now()): number {
  return shifts.reduce((sum, s) => sum + shiftSeconds(s, now), 0);
}
