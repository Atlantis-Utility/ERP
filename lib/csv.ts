// Minimal CSV parser (handles quoted fields, escaped quotes, and commas
// inside quotes), no dependency needed for the LinkedIn export sizes this
// deals with (a saved lead list, not millions of rows).
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  // Normalize line endings so \r\n doesn't leave a trailing \r in the last field.
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (inQuotes) {
      if (c === '"') {
        if (normalized[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  const [headers = [], ...body] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows: body };
}

// Best-effort auto-mapping from a CSV's actual headers to our known lead
// fields, matching against common LinkedIn Sales Navigator export aliases.
// The importer UI always lets the user override this before importing.
const FIELD_ALIASES: Record<string, string[]> = {
  companyName: ["company", "company name", "account name", "current company", "organization"],
  dba: ["dba", "d/b/a", "doing business as", "trade name"],
  businessType: ["business type", "type of business", "industry", "category", "vertical"],
  fullName: ["full name", "name", "contact name", "person name", "lead name"],
  title: ["title", "designation", "position", "job title", "headline"],
  website: ["website", "company website", "web address", "site", "url"],
  street: ["street", "street address", "address line 1", "address 1"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  zip: ["zip", "zip code", "zipcode", "postal code"],
  location: ["location", "company location", "geography", "account location"],
  linkedinUrl: ["linkedin url", "profile url", "public profile url", "linkedin"],
  instagramUrl: ["instagram", "instagram url", "instagram handle"],
  facebookUrl: ["facebook", "facebook url", "facebook page"],
};

export function guessColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const match = headers.find((h) => aliases.includes(h.toLowerCase().trim()));
    if (match) mapping[field] = match;
  }
  return mapping;
}
