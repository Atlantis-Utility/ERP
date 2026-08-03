"use client";

import { useState, useEffect } from "react";
import { supabase } from "../supabase/client";
import { subscribeTable } from "../supabase/realtime";
import type { Employee } from "../mock-data";

const TABLE = "employees";

interface Row { id: string; data: Employee }
const fromRow = (row: Row): Employee => ({ ...row.data, id: row.id });

function withTimeout<T>(promise: PromiseLike<T>, ms = 20_000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(
        // Client-side race, not a real network failure — the request may well
        // still complete server-side. Don't blame "your connection" for what
        // is usually just a slow query or a cold Supabase connection.
        () => reject(new Error("The server is taking longer than expected to respond. Please try again.")),
        ms
      )
    ),
  ]);
}

function isTransientFetchError(err: unknown): boolean {
  const msg = err && typeof err === "object" && "message" in err ? String((err as { message?: unknown }).message) : "";
  return /failed to fetch|networkerror|load failed/i.test(msg);
}

// Supabase's client silently refreshes the auth token in the background; if
// that happens to land mid-request the in-flight fetch can get dropped and
// throw "Failed to fetch" even though there's no real connectivity problem.
// One quiet retry absorbs that blip instead of surfacing it as an error —
// `run` must build a fresh query each call, since an already-awaited
// PromiseLike can't be re-issued.
async function withRetry<T>(run: () => PromiseLike<T>, retries = 1): Promise<T> {
  try {
    return await withTimeout(run());
  } catch (err) {
    if (retries > 0 && isTransientFetchError(err)) {
      await new Promise((r) => setTimeout(r, 500));
      return withRetry(run, retries - 1);
    }
    throw err;
  }
}

async function fetchAll(): Promise<Employee[]> {
  const { data, error } = await withRetry(() => supabase.from(TABLE).select("id, data").order("name"));
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

export function subscribeEmployees(cb: (employees: Employee[]) => void) {
  return subscribeTable(TABLE, fetchAll, cb);
}

export async function getAllEmployees(): Promise<Employee[]> {
  return fetchAll();
}

export async function addEmployee(emp: Employee): Promise<void> {
  const { error } = await withRetry(() =>
    supabase.from(TABLE).insert({ id: emp.id, name: emp.name, email: emp.email, status: emp.status, data: emp })
  );
  if (error) throw error;
}

export async function updateEmployee(id: string, patch: Partial<Employee>): Promise<void> {
  const { data: existing, error: fetchErr } = await withRetry(() =>
    supabase.from(TABLE).select("data").eq("id", id).single()
  );
  if (fetchErr) throw fetchErr;
  const merged = { ...(existing.data as Employee), ...patch };
  const { error } = await withRetry(() =>
    supabase.from(TABLE).update({ name: merged.name, email: merged.email, status: merged.status, data: merged }).eq("id", id)
  );
  if (error) throw error;
}

export async function removeEmployee(id: string): Promise<void> {
  const { error } = await withRetry(() => supabase.from(TABLE).delete().eq("id", id));
  if (error) throw error;
}

/** React hook — returns a live-updated list of all employees. */
export function useEmployees(): Employee[] {
  const [list, setList] = useState<Employee[]>([]);
  useEffect(() => {
    const unsub = subscribeEmployees(setList);
    return unsub;
  }, []);
  return list;
}
