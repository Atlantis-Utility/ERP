"use client";

import { useMemo } from "react";
import { useAuth } from "../auth-context";
import { useEmployees } from "../db/employees";

/**
 * The current user's employee id — the identity that authorship and sharing are
 * keyed on (note.authorId, recipientIds, lead assignees).
 *
 * Why this isn't just `authUser.employeeId`: `user_profiles.employee_id` is null
 * for accounts created before their employee record existed, which is every
 * admin here. auth-context already looks the employee up by email for the
 * display name, but deliberately leaves `employeeId` null — `current_user_id` in
 * localStorage is derived from it, and Logs and Projects read
 * `!localStorage.getItem("current_user_id")` as "is an admin", so backfilling it
 * there would silently demote both admins on those pages.
 *
 * So the email fallback lives here instead, where it only affects the features
 * that need an authorship identity. Returns "" when the user has no matching
 * employee record at all, which callers treat as "can't author".
 */
export function useCurrentEmployeeId(): string {
  const { authUser } = useAuth();
  const employees = useEmployees();

  return useMemo(() => {
    if (authUser?.employeeId) return authUser.employeeId;

    const email = authUser?.email?.trim().toLowerCase();
    if (!email) return "";

    return employees.find((e) => e.email?.trim().toLowerCase() === email)?.id ?? "";
  }, [authUser?.employeeId, authUser?.email, employees]);
}
