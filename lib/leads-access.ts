"use client";

import { useMemo } from "react";
import { useAuth } from "./auth-context";
import { useCurrentEmployeeId } from "./hooks/use-current-employee-id";
import { useGlobalLeadGrants, type LeadGrantLevel } from "./db/lead-grants";
import type { Lead, LeadAccessLevel } from "./db/leads";

/**
 * Who can see and do what with a lead.
 *
 * This deliberately mirrors the RLS policies in
 * supabase/migration-record-access.sql one-for-one. The database is the
 * enforcement, a member simply cannot read an unassigned lead, whatever the
 * UI does, and this exists so the interface doesn't offer actions the server
 * will refuse. If the two ever disagree, the database wins and the user sees
 * a permission error; that's the safe direction to be wrong in.
 *
 * Unlike lib/visibility.ts (which keys off employee *names*, because tasks
 * and projects store assignees as names), leads store `assignedTo` as an
 * employee id, so identity here is the employee id.
 */
export type { LeadAccessLevel };

export interface LeadsAccess {
  /** Leads administrator: sees every lead, assigns, grants, deletes. */
  isAdmin: boolean;
  /** The current user's employee id; "" when no employee record matches. */
  myEmployeeId: string;
  myName: string;
  /** An org-wide grant, if this user has one ("all leads, read-only"). */
  globalLevel: LeadGrantLevel | null;
  /** Strongest right the user holds on a lead, or null if they can't see it. */
  levelFor: (lead: LeadAccessInput) => LeadAccessLevel | null;
  canRead: (lead: LeadAccessInput) => boolean;
  canEdit: (lead: LeadAccessInput) => boolean;
  /** Reassigning is administrator-only, enforced by a DB trigger. */
  canAssign: boolean;
  /** Granting and revoking access is administrator-only. */
  canGrant: boolean;
  /** Deleting cascades to notes and activity, so administrator-only. */
  canDelete: boolean;
  /** A member may create a lead, but only assigned to themselves. */
  canCreate: boolean;
  /** True for a user who can see leads but change nothing, pure read-only. */
  isReadOnly: boolean;
}

/** The little a permission decision needs from a lead. */
export type LeadAccessInput = Pick<Lead, "id" | "assignedTo"> & { accessLevel?: LeadAccessLevel };

export function useLeadsAccess(): LeadsAccess {
  const { authUser } = useAuth();
  const myEmployeeId = useCurrentEmployeeId();
  // Only all-leads grants, which is at most one row per employee. Per-lead
  // grants are never loaded in bulk, a lead carries its own access level.
  const globalGrants = useGlobalLeadGrants();

  const isAdmin = authUser?.isUnrestricted ?? false;
  const myName = authUser?.displayName ?? "";

  const myGlobalLevel = useMemo(
    () => (myEmployeeId ? (globalGrants.find((g) => g.employeeId === myEmployeeId)?.level ?? null) : null),
    [globalGrants, myEmployeeId],
  );

  return useMemo(() => {
    const globalLevel: LeadGrantLevel | null = myGlobalLevel;

    const levelFor = (lead: LeadAccessInput): LeadAccessLevel | null => {
      // The database already decided, per row, and said so. Trusting that is
      // both cheaper and more accurate than re-deriving it here, it accounts
      // for per-lead grants the client never loads.
      if (lead.accessLevel) return lead.accessLevel;

      if (isAdmin) return "admin";
      // No employee record means no identity to match on, so nothing is
      // visible, the same conservative default lib/visibility.ts takes.
      if (!myEmployeeId) return null;
      if (lead.assignedTo && lead.assignedTo === myEmployeeId) return "owner";
      // Without a server-supplied level and no ownership, all that's left to
      // go on is an all-leads grant. A per-lead grant would have shown up
      // as accessLevel; assuming "editor" here instead would offer edit
      // controls the database then refuses.
      if (globalLevel === "editor") return "editor";
      if (globalLevel === "viewer") return "viewer";
      return null;
    };

    const canEdit = (lead: LeadAccessInput) => {
      const level = levelFor(lead);
      return level === "admin" || level === "owner" || level === "editor";
    };

    return {
      isAdmin,
      myEmployeeId,
      myName,
      globalLevel,
      levelFor,
      canRead: (lead) => levelFor(lead) !== null,
      canEdit,
      canAssign: isAdmin,
      canGrant: isAdmin,
      canDelete: isAdmin,
      canCreate: isAdmin || Boolean(myEmployeeId),
      // Someone whose only access is a read-only grant across every lead:
      // worth telling them plainly, rather than letting them find out by
      // clicking a disabled control.
      isReadOnly: !isAdmin && globalLevel === "viewer",
    };
  }, [isAdmin, myEmployeeId, myName, myGlobalLevel]);
}
