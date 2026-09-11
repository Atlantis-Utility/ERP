"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeProjects } from "@/lib/db/projects";
import type { Project } from "@/lib/mock-projects";

export interface CompanyOption {
  value: string;
  label: string;
}

/**
 * Company names already known to the app, for the project drawers' company
 * picker. Two sources, because neither alone is complete:
 *
 *   - the RingLogix customer registry, which is the closest thing to a
 *     canonical customer list, and
 *   - client names on existing projects, which catch one-off clients that were
 *     never onboarded as RingLogix customers.
 *
 * Deduped case-insensitively (first spelling seen wins) and sorted. Returns an
 * empty list rather than throwing when RingLogix isn't reachable or configured
 * — the caller still offers free text, so a missing list is a degraded picker,
 * not a broken form.
 */
export function useCompanyOptions(): CompanyOption[] {
  const [customerNames, setCustomerNames] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => subscribeProjects(setProjects), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ringlogix/customers")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: unknown) => {
        if (cancelled || !Array.isArray(rows)) return;
        setCustomerNames(
          rows
            .map((r) => (r && typeof r === "object" ? String((r as { company?: unknown }).company ?? "") : ""))
            .filter(Boolean),
        );
      })
      .catch(() => {/* picker degrades to free text */});
    return () => { cancelled = true; };
  }, []);

  return useMemo(() => {
    const byKey = new Map<string, string>();
    for (const raw of [...customerNames, ...projects.map((p) => p.clientName ?? "")]) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, name);
    }
    return [...byKey.values()]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [customerNames, projects]);
}
