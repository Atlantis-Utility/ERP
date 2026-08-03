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
export async function setUserAdmin(uid: string, isAdmin: boolean): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ is_admin: isAdmin }).eq("uid", uid);
  if (error) throw error;
}

/** Ensure the current user's profile exists and has isAdmin: true. */
export async function ensureAdminProfile(uid: string, email: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ uid, email, employee_id: null, is_admin: true }, { onConflict: "uid", ignoreDuplicates: false });
  if (error) throw error;
}
