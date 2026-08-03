"use client";

import { supabase } from "../supabase/client";
import { subscribeTable } from "../supabase/realtime";
import type { Project } from "../mock-projects";

const TABLE = "projects";

interface Row { id: string; data: Project }
const fromRow = (row: Row): Project => ({ ...row.data, id: row.id });

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

function dropUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

async function fetchAll(): Promise<Project[]> {
  const { data, error } = await supabase.from(TABLE).select("id, data").order("name");
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

export function subscribeProjects(cb: (projects: Project[]) => void) {
  return subscribeTable(TABLE, fetchAll, cb);
}

export async function addProject(proj: Project): Promise<void> {
  const clean = dropUndefined(proj);
  const { error } = await withTimeout(
    supabase.from(TABLE).insert({ id: clean.id, name: clean.name, status: clean.status, data: clean })
  );
  if (error) throw error;
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase.from(TABLE).select("data").eq("id", id).single();
  if (fetchErr) throw fetchErr;
  const merged = dropUndefined({ ...(existing.data as Project), ...dropUndefined(patch) });
  const { error } = await withTimeout(
    supabase.from(TABLE).update({ name: merged.name, status: merged.status, data: merged }).eq("id", id)
  );
  if (error) throw error;
}

export async function removeProject(id: string): Promise<void> {
  const { error } = await withTimeout(supabase.from(TABLE).delete().eq("id", id));
  if (error) throw error;
}
