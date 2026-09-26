"use client";

import { supabase } from "../supabase/client";

export interface UserProfile {
  uid:        string;
  email:      string;
  displayName?: string;
  employeeId: string | null;
  isAdmin:    boolean;
  createdAt:  string;
}

const TABLE = "user_profiles";

function fromRow(row: Record<string, unknown>): UserProfile {
  return {
    uid: row.uid as string,
    email: row.email as string,
    displayName: (row.display_name as string) ?? undefined,
    employeeId: (row.employee_id as string) ?? null,
    isAdmin: row.is_admin as boolean,
    createdAt: row.created_at as string,
  };
}

/** Live listener for all user profiles (admin use only). */
export function subscribeUserProfiles(cb: (profiles: UserProfile[]) => void) {
  function load() {
    supabase.from(TABLE).select("*").order("created_at").then(({ data, error }) => {
      if (error) { console.error("[user-profiles]", error); return; }
      cb((data ?? []).map(fromRow));
    });
  }
  load();

  const channel = supabase
    .channel("user-profiles-all")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, load)
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

/** Set or update admin status for a user. */
/**
 * Admin access is granted through an API route, not written from here: the
 * table's policy lets anyone update their own row, so a client-side write
 * meant anybody could grant it to themselves. The route checks the caller
 * is an administrator and writes with the service key.
 */
export async function setUserAdmin(uid: string, isAdmin: boolean): Promise<void> {
  const res = await fetch("/api/admin/user-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, isAdmin }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Couldn't update access");
  }
}

/**
 * Makes sure the signed-in user has a profile row. It used to force
 * is_admin true, which is how a Contributor's first visit to Settings made
 * them an administrator to every route that trusts that column. Admin is
 * decided by the access role on the employee record now, so this only
 * fills the gap where no row exists at all.
 */
export async function ensureProfile(uid: string, email: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ uid, email }, { onConflict: "uid", ignoreDuplicates: true });
  if (error) throw error;
}
