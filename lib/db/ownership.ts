"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";

/**
 * Whether the signed-in user owns the workspace.
 *
 * Deleting leads or a campaign destroys work that can't be got back: a lead
 * takes its notes and history with it, a campaign takes its whole sheet. That
 * is reserved for the owner rather than offered to anyone holding the
 * Administrator role.
 *
 * The answer comes from erp_is_owner() rather than being worked out here, so
 * there is one definition of ownership and it lives next to the policies that
 * enforce it (supabase/migration-campaign-approvals.sql). Asking the database
 * also means the UI can't offer a delete the database will refuse.
 *
 * Ownership is a flag on the employee record (data.isOwner). Until someone is
 * marked, erp_is_owner() answers for administrators, so an install doesn't
 * leave nobody able to delete anything.
 */

// Shared across components and across mounts: it's one boolean per session,
// and three panels asking on the same page shouldn't be three round trips.
let cached: Promise<boolean> | null = null;

export function fetchIsOwner(): Promise<boolean> {
  if (!cached) {
    cached = (async () => {
      try {
        const { data, error } = await supabase.rpc("erp_is_owner");
        // A missing function means the migration hasn't been run. Falling
        // back to "not the owner" hides the delete actions rather than
        // offering ones the database would refuse.
        if (error) return false;
        return data === true;
      } catch {
        return false;
      }
    })();
  }
  return cached;
}

/** Forgets the cached answer, for when the signed-in user changes. */
export function resetIsOwner(): void {
  cached = null;
}

export function useIsOwner(): boolean {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchIsOwner().then((value) => {
      if (!cancelled) setIsOwner(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return isOwner;
}
