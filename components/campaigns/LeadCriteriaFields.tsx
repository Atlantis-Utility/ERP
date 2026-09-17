"use client";

import { useEffect, useState } from "react";
import Select from "@/components/ui/Select";
import { useEmployees } from "@/lib/db/employees";
import { fetchLeadFieldValues, type CampaignCriteria, type LeadFacet, type LeadFacetField } from "@/lib/db/campaigns";
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/lib/leads-constants";

const FACET_FIELDS: { field: LeadFacetField; label: string; key: keyof CampaignCriteria }[] = [
  { field: "city", label: "City", key: "city" },
  { field: "state", label: "State", key: "state" },
  { field: "businessType", label: "Category", key: "category" },
  { field: "source", label: "Source", key: "source" },
];

const inputClass =
  "w-full text-sm border border-[#eaeaea] rounded-md px-3 py-2 outline-none focus:border-[#0070f3] transition-colors";
const labelClass = "text-[11px] font-medium text-[#666]";

/**
 * Which leads to pull into a campaign. Shared by the create dialog and the
 * sheet's own "add leads", so the two can't drift on what a criteria set
 * means, and neither can drift from campaign_selection_matches in SQL,
 * which is what actually applies them.
 *
 * City / state / category / source options are read from the leads on file
 * with their counts, so you pick from what exists rather than typing a value
 * and hoping it matches.
 */
export default function LeadCriteriaFields({
  criteria,
  onChange,
  onError,
}: {
  criteria: CampaignCriteria;
  onChange: (criteria: CampaignCriteria) => void;
  onError?: (message: string) => void;
}) {
  const employees = useEmployees();
  const [facets, setFacets] = useState<Partial<Record<LeadFacetField, LeadFacet[]>>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(FACET_FIELDS.map(async (f) => [f.field, await fetchLeadFieldValues(f.field)] as const))
      .then((entries) => {
        if (!cancelled) {
          setFacets(Object.fromEntries(entries) as Partial<Record<LeadFacetField, LeadFacet[]>>);
        }
      })
      .catch(() => onError?.("Couldn't load the lead filter options."));
    return () => {
      cancelled = true;
    };
    // onError is a callback from the parent's render; depending on it would
    // re-run this on every keystroke there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof CampaignCriteria>(key: K, value: CampaignCriteria[K]) =>
    onChange({ ...criteria, [key]: value });

  const facetOptions = (field: LeadFacetField) =>
    (facets[field] ?? []).map((f) => ({
      value: f.value,
      label: `${f.value} (${f.count.toLocaleString()})`,
    }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FACET_FIELDS.map((f) => (
          <div key={f.field} className="flex flex-col gap-1.5">
            <label className={labelClass}>{f.label}</label>
            <Select
              value={String(criteria[f.key] ?? "")}
              onChange={(v) => set(f.key, v as never)}
              placeholder={`Any ${f.label.toLowerCase()}`}
              options={facetOptions(f.field)}
              searchable
              clearable
            />
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Stage</label>
          <Select
            value={criteria.status}
            onChange={(v) => set("status", v)}
            placeholder="Any stage"
            options={STATUS_OPTIONS}
            clearable
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Priority</label>
          <Select
            value={criteria.priority}
            onChange={(v) => set("priority", v)}
            placeholder="Any priority"
            options={PRIORITY_OPTIONS}
            clearable
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Current owner</label>
          <Select
            value={criteria.assignedTo}
            onChange={(v) => set("assignedTo", v)}
            placeholder="Any owner"
            options={employees.map((e) => ({ value: e.id, label: e.name }))}
            searchable
            clearable
            disabled={criteria.unassignedOnly}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Tag</label>
          <input
            value={criteria.tag}
            onChange={(e) => set("tag", e.target.value)}
            className={inputClass}
            placeholder="Any tag"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={labelClass}>Search</label>
        <input
          value={criteria.search}
          onChange={(e) => set("search", e.target.value)}
          className={inputClass}
          placeholder="Company, contact, phone, address…"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer pt-1">
        <input
          type="checkbox"
          checked={criteria.unassignedOnly}
          onChange={(e) => {
            // Mutually exclusive with picking an owner: both set at once
            // would mean "owned by X and owned by nobody", which matches
            // nothing and looks like a bug.
            onChange({
              ...criteria,
              unassignedOnly: e.target.checked,
              assignedTo: e.target.checked ? "" : criteria.assignedTo,
            });
          }}
          className="w-3.5 h-3.5 accent-[#0a0a0a] cursor-pointer"
        />
        <span className="text-[13px] text-[#444]">Unassigned leads only</span>
      </label>
    </div>
  );
}
