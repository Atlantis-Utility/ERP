// Duplicate detection + field-level merge for CSV imports. When a CSV row
// matches a lead already in the table (same company, same person), we don't
// want a blind overwrite: empty fields on the existing record get filled in
// automatically, but a field that's set on both sides with a different value
// is a genuine conflict the caller (ImportLeadsCsvModal) prompts the user to
// resolve, either one at a time or via a "use new data for everything" override.
import type { Lead } from "./db/leads";

export interface FieldConflict {
  key: keyof Lead;
  label: string;
  existingValue: string;
  newValue: string;
}

export interface MergeResult {
  id: string;
  isNew: boolean;
  // Company/POC + every non-conflicting field already resolved (existing
  // value kept, or filled in from the new row if it was empty). Conflicting
  // fields still hold the existing value here until a resolution is applied.
  base: Lead;
  conflicts: FieldConflict[];
  // The new-side value for each conflicting field, keyed by field name, so a
  // "use new" resolution can be applied without re-deriving it later.
  newValues: Partial<Record<string, string>>;
}

const MERGEABLE_FIELDS: { key: keyof Lead; label: string }[] = [
  { key: "dba", label: "DBA" },
  { key: "businessType", label: "Business Type" },
  { key: "pocName", label: "Point of Contact" },
  { key: "pocTitle", label: "Title" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "street", label: "Street" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "Zip Code" },
  { key: "location", label: "Location" },
  { key: "companySize", label: "Company Size" },
  { key: "linkedinUrl", label: "LinkedIn URL" },
  { key: "instagramUrl", label: "Instagram" },
  { key: "facebookUrl", label: "Facebook" },
];

function normalizeKey(s?: string): string {
  return (s ?? "").trim().toLowerCase();
}

// Groups existing leads by normalized company name so matching a CSV row
// against thousands of leads is a map lookup, not a full-table scan per row.
export function buildCompanyIndex(existing: Lead[]): Map<string, Lead[]> {
  const index = new Map<string, Lead[]>();
  for (const lead of existing) {
    const key = normalizeKey(lead.companyName);
    const bucket = index.get(key);
    if (bucket) bucket.push(lead);
    else index.set(key, [lead]);
  }
  return index;
}

// Same company name is necessary but not sufficient, a company can have
// several different real contacts on file. If the new row names a person,
// prefer an exact name match at that company; otherwise fall back to a
// same-company lead that has no point of contact recorded yet (a bare
// company record absorbing its first named contact), and only default to
// "the one same-company lead" when there's no ambiguity.
export function findExistingMatch(index: Map<string, Lead[]>, companyName: string, pocName?: string): Lead | undefined {
  const candidates = index.get(normalizeKey(companyName));
  if (!candidates || candidates.length === 0) return undefined;

  const pocKey = normalizeKey(pocName);
  if (pocKey) {
    const exact = candidates.find((l) => normalizeKey(l.pocName) === pocKey);
    if (exact) return exact;
  }
  return candidates.find((l) => !l.pocName?.trim()) ?? (candidates.length === 1 ? candidates[0] : undefined);
}

export function computeMerge(existing: Lead | undefined, candidate: Lead): MergeResult {
  if (!existing) {
    return { id: candidate.id, isNew: true, base: candidate, conflicts: [], newValues: {} };
  }

  const base: Lead = { ...existing };
  const conflicts: FieldConflict[] = [];
  const newValues: Partial<Record<string, string>> = {};

  for (const { key, label } of MERGEABLE_FIELDS) {
    const existingValue = ((existing[key] as string | undefined) ?? "").trim();
    const newValue = ((candidate[key] as string | undefined) ?? "").trim();
    if (!newValue) continue; // nothing new to bring in, keep whatever's there

    if (!existingValue) {
      (base as unknown as Record<string, unknown>)[key] = newValue; // gap fill, no conflict
      continue;
    }
    if (existingValue.toLowerCase() === newValue.toLowerCase()) continue; // already the same

    conflicts.push({ key, label, existingValue, newValue });
    newValues[key] = newValue;
  }

  // Coordinates aren't user-facing text, so they never go through the
  // string-diff/conflict flow above, just fill them in if we don't have
  // them yet (e.g. the existing record was entered by hand, the new one
  // came with an Azure Maps match).
  if (base.lat === undefined && base.lon === undefined && candidate.lat !== undefined && candidate.lon !== undefined) {
    base.lat = candidate.lat;
    base.lon = candidate.lon;
  }

  base.updatedAt = new Date().toISOString();
  return { id: existing.id, isNew: false, base, conflicts, newValues };
}

// Bakes a per-field "existing" | "new" decision into the final Lead object
// that actually gets written.
export function applyResolutions(result: MergeResult, resolutions: Record<string, "existing" | "new">): Lead {
  const final = { ...result.base };
  for (const conflict of result.conflicts) {
    if (resolutions[conflict.key] === "new") {
      (final as unknown as Record<string, unknown>)[conflict.key] = result.newValues[conflict.key];
    }
  }
  return final;
}
