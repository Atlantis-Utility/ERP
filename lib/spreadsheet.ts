import { parseCsv } from "./csv";
import { isExcelFileName, isLegacyExcelFileName, parseXlsx, SpreadsheetError, type SheetData } from "./xlsx";

export { SpreadsheetError, type SheetData };

/** What a file input should accept, kept next to the code that reads it. */
export const SPREADSHEET_ACCEPT = ".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface Workbook {
  fileName: string;
  /** One entry for a CSV, one per visible sheet for a workbook. */
  sheets: SheetData[];
}

/**
 * Reads a lead list out of whatever the user has to hand: a CSV, or an Excel
 * workbook. Both come back in the same shape so the importer's mapping and
 * review steps don't care which it was.
 *
 * Column headers are normalized here rather than in either parser, because
 * the mapping UI identifies a column *by its header text*: two columns
 * sharing a name (or having none at all, which is common a few columns past
 * the end of a hand-kept sheet) would otherwise be impossible to tell apart
 * in the dropdown, and picking one would silently read the other.
 */
export async function readSpreadsheet(file: File): Promise<Workbook> {
  if (isLegacyExcelFileName(file.name)) {
    throw new SpreadsheetError("That's a legacy .xls file. Open it in Excel and save as .xlsx or CSV, then import that.");
  }

  const sheets = isExcelFileName(file.name)
    ? await parseXlsx(file)
    : [{ name: file.name, ...parseCsv(await file.text()) }];

  return {
    fileName: file.name,
    sheets: sheets.map((s) => ({ ...s, headers: normalizeHeaders(s.headers) })),
  };
}

/** "A", "B" ... "AA", matching the column letters shown in Excel. */
export function columnLetter(index: number): string {
  let out = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  }
  return out;
}

function normalizeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((raw, i) => {
    // Collapse the newlines and runs of spaces a hand-formatted header picks
    // up, so "Company \n Name" matches the same alias "Company Name" does.
    const clean = raw.replace(/\s+/g, " ").trim() || `Column ${columnLetter(i)}`;
    const count = seen.get(clean) ?? 0;
    seen.set(clean, count + 1);
    return count === 0 ? clean : `${clean} (${count + 1})`;
  });
}
