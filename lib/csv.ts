/**
 * Picks the separator a file actually uses. Excel writes the list separator
 * of the machine it ran on, so a sheet saved as CSV in most of Europe is
 * semicolon-delimited, and a "CSV" exported from some tools is really tabs.
 * Counting outside quotes on the header line is enough to tell them apart:
 * the real separator is the one that appears most.
 */
function sniffDelimiter(firstLine: string): string {
  const counts = [",", ";", "\t"].map((d) => {
    let n = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) n++;
    }
    return { d, n };
  });
  const best = counts.reduce((a, b) => (b.n > a.n ? b : a));
  return best.n > 0 ? best.d : ",";
}

// Minimal CSV parser (handles quoted fields, escaped quotes, and separators
// inside quotes), no dependency needed for the LinkedIn export sizes this
// deals with (a saved lead list, not millions of rows).
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  // Normalize line endings so \r\n doesn't leave a trailing \r in the last
  // field, and drop the byte-order mark Excel puts at the front of a
  // "CSV UTF-8" export, which otherwise becomes part of the first header and
  // stops it matching any known column name.
  const normalized = text
    .replace(/^﻿/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const delimiter = sniffDelimiter(normalized.slice(0, normalized.indexOf("\n") + 1 || undefined));

  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (inQuotes) {
      if (c === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
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
  description: [
    "description",
    "about",
    "summary",
    "company description",
    "notes",
    "note",
    "details",
    "overview",
    "comments",
    "remarks",
  ],
  fullName: ["full name", "name", "contact name", "person name", "lead name"],
  title: ["title", "designation", "position", "job title", "headline"],
  phone: [
    "phone",
    "phone number",
    "telephone",
    "tel",
    "mobile",
    "mobile number",
    "cell",
    "cell phone",
    "work phone",
    "direct phone",
    "business phone",
    "contact number",
    "primary phone",
  ],
  email: [
    "email",
    "e-mail",
    "email address",
    "e-mail address",
    "work email",
    "business email",
    "contact email",
    "primary email",
  ],
  companySize: [
    "company size",
    "size",
    "employees",
    "employee count",
    "# employees",
    "number of employees",
    "headcount",
    "company headcount",
  ],
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
