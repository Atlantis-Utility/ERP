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
  /**
   * Identifies this CSV *row*. Always unique, which `id` is not: two rows in
   * one file can match the same lead already on file, and keying the UI or
   * the per-field resolutions on `id` made them share state.
   */
  key: string;
  /** The lead id that will be written, the existing one, or a new one. */
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
  { key: "description", label: "Description" },
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

/**
 * Everything duplicate *detection* needs from an existing lead. Deliberately
 * narrower than Lead: at ten thousand leads, matching an import against the
 * table pulls only these three fields per row (a few hundred KB) rather than
 * whole records, and the handful that actually match are then fetched in
 * full for the field-level merge below. A full `Lead` satisfies this too.
 */
export interface DedupeCandidate {
  id: string;
  companyName: string;
  pocName?: string;
  street?: string;
  city?: string;
  zip?: string;
}

function normalizeKey(s?: string): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The same business in one string: company, street, city, zip.
 *
 * Used for the rows of a single file, where nothing is on file yet to match
 * against. A city licence list names a company once per permit it holds, so
 * one hotel arrives six times with the same address and a different licence
 * type each time; without this every one of them is a new lead, which is how
 * 917 duplicates got in. Empty where there's no address, so a file with no
 * address column falls back to the company/contact rules below rather than
 * collapsing every unrelated row that happens to be blank.
 */
export function addressKey(l: { companyName: string; street?: string; city?: string; zip?: string }): string {
  const street = normalizeKey(l.street);
  if (!street) return "";
  return [normalizeKey(l.companyName), street, normalizeKey(l.city), normalizeKey(l.zip)].join("|");
}

// Groups existing leads by normalized company name so matching a CSV row
// against thousands of leads is a map lookup, not a full-table scan per row.
export function buildCompanyIndex<T extends DedupeCandidate>(existing: T[]): Map<string, T[]> {
  const index = new Map<string, T[]>();
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
// prefer an exact name match at that company; then the same company at the
// same street address, which is the same business whoever is named on it;
// then a same-company lead that has no point of contact recorded yet (a bare
// company record absorbing its first named contact), and only default to
// "the one same-company lead" when there's no ambiguity.
export function findExistingMatch<T extends DedupeCandidate>(
  index: Map<string, T[]>,
  incoming: { companyName: string; pocName?: string; street?: string; city?: string; zip?: string },
): T | undefined {
  const candidates = index.get(normalizeKey(incoming.companyName));
  if (!candidates || candidates.length === 0) return undefined;

  const pocKey = normalizeKey(incoming.pocName);
  if (pocKey) {
    const exact = candidates.find((l) => normalizeKey(l.pocName) === pocKey);
    if (exact) return exact;
  }

  // Address before the fallbacks: re-importing a licence list shouldn't add a
  // second row for a company we already have at that address just because
  // this row's permit lists a different owner name.
  const address = addressKey(incoming);
  if (address) {
    const sameAddress = candidates.find((l) => addressKey(l) === address);
    if (sameAddress) return sameAddress;
  }

  return candidates.find((l) => !l.pocName?.trim()) ?? (candidates.length === 1 ? candidates[0] : undefined);
}

export function computeMerge(existing: Lead | undefined, candidate: Lead): MergeResult {
  if (!existing) {
    return { key: candidate.id, id: candidate.id, isNew: true, base: candidate, conflicts: [], newValues: {} };
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
  return { key: candidate.id, id: existing.id, isNew: false, base, conflicts, newValues };
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
