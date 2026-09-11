"use client";

import { useMemo } from "react";
import { useAuth } from "./auth-context";
import { useEmployees } from "./db/employees";
import type { Project } from "./mock-projects";

// Record-level visibility for tasks and projects: you see what you're assigned
// to, administrators see everything.
//
// Assignments are stored as employee *names*, not ids — KanbanCard.assignees,
// Project.owner/team and Ticket.assigneeName all hold the string from
// employees.name (see AddTaskDrawer and AddProjectDrawer, which build their
// pickers from `emp.name`). So the identity to compare against is the name on
// the current user's employee row, not their employee id or auth display name,
// which can differ.
//
// This is UI filtering, not enforcement: Supabase RLS on these tables is still
// authenticated read/write, so a determined user could read the rows straight
// from the API. It hides records; it does not protect them.

export interface Visibility {
  /** Administrators, and bootstrap admins with no employee record. */
  seesAll: boolean;
  /** The current user's employee name; "" when no employee row matches. */
  myName: string;
  /** True when any of these assignee names is the current user (or they see all). */
  isMine: (names: readonly (string | undefined | null)[]) => boolean;
  /** Owner counts as assigned, not just the team list. */
  ownsProject: (project: Pick<Project, "owner" | "team">) => boolean;
}

export function useVisibility(): Visibility {
  const { authUser } = useAuth();
  const employees = useEmployees();

  // Read to primitives first so the memo closes over those rather than the
  // whole authUser object, which would widen its inferred dependencies.
  const accessEmployeeId = authUser?.accessEmployeeId ?? "";
  const email = authUser?.email?.trim().toLowerCase() ?? "";
  const seesAll = authUser?.isUnrestricted ?? false;

  const myName = useMemo(() => {
    const byId = accessEmployeeId ? employees.find((e) => e.id === accessEmployeeId) : undefined;
    const row = byId ?? (email ? employees.find((e) => e.email?.trim().toLowerCase() === email) : undefined);
    return row?.name ?? "";
  }, [accessEmployeeId, email, employees]);

  return useMemo(() => {
    const matches = (name: string | undefined | null) =>
      Boolean(name && myName && name.trim().toLowerCase() === myName.trim().toLowerCase());

    return {
      seesAll,
      myName,
      // No employee name means nothing can match, so a restricted login with no
      // employee record sees an empty board rather than everything.
      isMine: (names) => seesAll || names.some(matches),
      ownsProject: (project) => seesAll || matches(project.owner) || (project.team ?? []).some(matches),
    };
  }, [seesAll, myName]);
}
