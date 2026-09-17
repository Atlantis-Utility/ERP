/**
 * Minimal .xlsx / .xlsm reader.
 *
 * A workbook is a ZIP of XML parts, and both halves of that are already in
 * the browser: `DecompressionStream("deflate-raw")` does the inflating, and
 * the XML these files contain is machine-written and regular enough to scan
 * directly. That is the whole reason this is hand-rolled rather than pulled
 * from npm, the same call lib/csv.ts makes: a spreadsheet library is a
 * megabyte of parser in the bundle for one modal, and the two in wide use
 * either carry known advisories on their npm build or are published outside
 * the registry.
 *
 * Deliberately not handled:
 *   - the legacy binary .xls format, which shares nothing with this one.
 *     isLegacyExcelFile() spots it so the importer can say so plainly.
 *   - cell formatting beyond what changes the *value* a caller would read:
 *     dates (a serial number is meaningless in an import) and zero-padded
 *     numbers (a zip code must keep its leading zero).
 *   - formulas, which are read as their last-cached result, which is what
 *     Excel itself shows and therefore what the person who sent the file
 *     expects to import.
 */

export interface SheetData {
  name: string;
  headers: string[];
  rows: string[][];
}

/** A failure worth showing verbatim: every message is actionable. */
export class SpreadsheetError extends Error {}

export function isExcelFileName(name: string): boolean {
  return /\.(xlsx|xlsm)$/i.test(name);
}

export function isLegacyExcelFileName(name: string): boolean {
  return /\.xls$/i.test(name);
}

/* ─── ZIP ─────────────────────────────────────────────────────────────── */

interface ZipEntry {
  method: number;
  compressedSize: number;
  offset: number;
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

function readZipIndex(buf: ArrayBuffer): Map<string, ZipEntry> {
  const dv = new DataView(buf);
  const decoder = new TextDecoder();

  // The end-of-central-directory record is 22 bytes plus an optional trailing
  // comment, so its position isn't fixed and has to be found by scanning back
  // from the end of the file (the comment can be up to 64KB).
  let eocd = -1;
  const floor = Math.max(0, buf.byteLength - 22 - 65_535);
  for (let i = buf.byteLength - 22; i >= floor; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SpreadsheetError("That file isn't a readable .xlsx workbook.");

  const count = dv.getUint16(eocd + 10, true);
  const entries = new Map<string, ZipEntry>();
  let p = dv.getUint32(eocd + 16, true);

  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.byteLength || dv.getUint32(p, true) !== CENTRAL_SIG) break;
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    entries.set(decoder.decode(new Uint8Array(buf, p + 46, nameLen)), {
      method: dv.getUint16(p + 10, true),
      // Read from the central directory rather than the local header: a
      // streamed writer is allowed to leave the local sizes as zero and put
      // the real ones in a trailing data descriptor.
      compressedSize: dv.getUint32(p + 20, true),
      offset: dv.getUint32(p + 42, true),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(buf: ArrayBuffer, entry: ZipEntry): Promise<string> {
  const dv = new DataView(buf);
  if (dv.getUint32(entry.offset, true) !== LOCAL_SIG) {
    throw new SpreadsheetError("That workbook looks damaged. Try re-saving it from Excel.");
  }
  const nameLen = dv.getUint16(entry.offset + 26, true);
  const extraLen = dv.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLen + extraLen;
  const raw = buf.slice(start, start + entry.compressedSize);

  if (entry.method === 0) return new TextDecoder().decode(raw);
  if (entry.method !== 8) {
    throw new SpreadsheetError("That workbook is compressed in a way the importer can't read. Re-save it as .xlsx or CSV.");
  }
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

function supportsInflate(): boolean {
  try {
    new DecompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
}

/* ─── XML ─────────────────────────────────────────────────────────────── */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function unescapeXml(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, code: string) => {
    if (code.startsWith("#")) {
      const n = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code] ?? whole;
  });
}

/** Reads one attribute out of a raw tag. Values in these files are always double-quoted. */
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name.replace(":", "\\:")}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

/** Concatenates every <t> in a fragment: rich text splits one string across runs. */
function innerText(fragment: string): string {
  let out = "";
  // <rPh> is a furigana pronunciation hint, not part of the string itself.
  const cleaned = fragment.includes("<rPh") ? fragment.replace(/<rPh[\s\S]*?<\/rPh>/g, "") : fragment;
  for (const m of cleaned.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return unescapeXml(out);
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si(?:\s[^>]*)?\/>/g)) {
    out.push(m[1] ? innerText(m[1]) : "");
  }
  return out;
}

/* ─── Number formats ─────────────────────────────────────────────────── */

/**
 * The built-in format ids that mean "this number is a date and/or a time".
 * Everything from 164 up is defined by the workbook itself and is read from
 * its format code instead.
 */
const BUILTIN_DATE_IDS = new Set([
  14, 15, 16, 17, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58,
]);
/** Times and durations, with no date part to show. */
const BUILTIN_TIME_IDS = new Set([18, 19, 20, 21, 45, 46, 47]);
/** The one built-in that carries both (m/d/yy h:mm). */
const BUILTIN_DATETIME_ID = 22;

interface StyleInfo {
  date: boolean;
  time: boolean;
  /** Digits to pad a whole number out to, from an all-zeroes format like "00000". */
  pad: number;
}

const PLAIN_STYLE: StyleInfo = { date: false, time: false, pad: 0 };

function styleFromFormat(id: number, code: string | undefined): StyleInfo {
  if (id === BUILTIN_DATETIME_ID) return { date: true, time: true, pad: 0 };
  if (BUILTIN_TIME_IDS.has(id)) return { date: false, time: true, pad: 0 };
  if (BUILTIN_DATE_IDS.has(id)) return { date: true, time: false, pad: 0 };
  if (!code) return PLAIN_STYLE;

  // Strip the parts of a format code that aren't date/time tokens: quoted
  // literals, escaped characters, colour and locale directives like [$-409].
  const tokens = code
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[[^\]]*\]/g, "");
  const date = /[dy]/i.test(tokens) || /m{3,}/i.test(tokens);
  const time = /[hs]/i.test(tokens) || tokens.includes("AM/PM");
  if (date || time) return { date, time, pad: 0 };

  const padded = /^0+$/.exec(tokens.split(";")[0].trim());
  return padded ? { date: false, time: false, pad: padded[0].length } : PLAIN_STYLE;
}

/** cellXfs in document order: a cell's `s` attribute is an index into this. */
function parseStyles(xml: string): StyleInfo[] {
  const codes = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\s[^>]*\/?>/g)) {
    const id = Number(attr(m[0], "numFmtId"));
    const code = attr(m[0], "formatCode");
    if (Number.isFinite(id) && code !== null) codes.set(id, unescapeXml(code));
  }
  const block = /<cellXfs(?:\s[^>]*)?>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  const styles: StyleInfo[] = [];
  for (const m of block.matchAll(/<xf(?:\s[^>]*?)?(?:\/>|>)/g)) {
    const id = Number(attr(m[0], "numFmtId") ?? "0");
    styles.push(styleFromFormat(id, codes.get(id)));
  }
  return styles;
}

/* ─── Values ─────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Excel counts days from an epoch, so a date cell arrives as a number and has
 * to be turned back into something a person (and the rest of the importer)
 * can read. Output is ISO, which is also what the lead fields store.
 */
function serialToText(serial: number, style: StyleInfo, date1904: boolean): string {
  // The 1900 workbook counts a 29 February 1900 that never happened, so
  // serials from 61 on are one day ahead of a true day count. Treating the
  // epoch as 30 December 1899 cancels that out for every date after the
  // phantom day, and anything at or below it is shifted back by hand.
  let days = serial;
  if (!date1904 && serial < 61) days += 1;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const at = new Date(epoch + Math.round(days * DAY_MS));
  if (Number.isNaN(at.getTime())) return String(serial);

  const hhmm = `${pad2(at.getUTCHours())}:${pad2(at.getUTCMinutes())}`;
  // A duration or time-of-day cell has no date part to show.
  if (!style.date) return hhmm;
  const date = at.toISOString().slice(0, 10);
  return style.time && serial % 1 !== 0 ? `${date} ${hhmm}` : date;
}

function numberToText(value: number, style: StyleInfo, date1904: boolean): string {
  if (style.date || style.time) return serialToText(value, style, date1904);
  // A zip code, a phone extension, an account number: stored as a number with
  // a zeroes format, so the leading zeros only exist in the format code.
  if (style.pad && Number.isInteger(value) && value >= 0) {
    return String(value).padStart(style.pad, "0");
  }
  return String(value);
}

function cellText(tag: string, body: string, shared: string[], styles: StyleInfo[], date1904: boolean): string {
  const type = attr(tag, "t") ?? "n";
  if (type === "inlineStr") return innerText(body);

  const raw = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1];
  if (raw === undefined) return "";

  switch (type) {
    case "s": {
      const i = Number(raw);
      return Number.isInteger(i) ? (shared[i] ?? "") : "";
    }
    case "str":
      return unescapeXml(raw).trim();
    case "b":
      return raw === "1" ? "TRUE" : "FALSE";
    // A formula that errored (#N/A, #REF!) has no value to import, and
    // carrying the error text through would create leads named "#N/A".
    case "e":
      return "";
    case "d":
      return unescapeXml(raw).slice(0, 10);
    default: {
      const n = Number(raw);
      if (!Number.isFinite(n)) return unescapeXml(raw).trim();
      const style = styles[Number(attr(tag, "s") ?? "0")] ?? PLAIN_STYLE;
      return numberToText(n, style, date1904);
    }
  }
}

/** "BC" is column 55. Cells are allowed to be sparse, so the reference matters. */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function parseSheetXml(xml: string, shared: string[], styles: StyleInfo[], date1904: boolean): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cellMatch[1] ?? "";
      const ref = attr(tag, "r");
      const at = ref ? columnIndex(ref) : cells.length;
      if (at < 0) continue;
      while (cells.length < at) cells.push("");
      cells[at] = cellText(tag, cellMatch[2] ?? "", shared, styles, date1904);
    }
    rows.push(cells);
  }
  return rows;
}

/* ─── Workbook ───────────────────────────────────────────────────────── */

interface SheetRef {
  name: string;
  path: string;
}

/** Relationship targets are relative to xl/, except when they're absolute. */
function resolveTarget(target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  return `xl/${target.replace(/^\.\//, "")}`;
}

function listSheets(workbookXml: string, relsXml: string): SheetRef[] {
  const rels = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\s[^>]*\/?>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) rels.set(id, resolveTarget(unescapeXml(target)));
  }

  const sheets: SheetRef[] = [];
  for (const m of workbookXml.matchAll(/<sheet\s[^>]*\/?>/g)) {
    // A hidden sheet is usually a lookup table or a scratch pad, so offering
    // it as an import source would be noise.
    const state = attr(m[0], "state");
    if (state === "hidden" || state === "veryHidden") continue;
    const rid = attr(m[0], "r:id");
    const path = rid ? rels.get(rid) : undefined;
    if (path) sheets.push({ name: unescapeXml(attr(m[0], "name") ?? "Sheet"), path });
  }
  return sheets;
}

function findEntry(entries: Map<string, ZipEntry>, path: string): ZipEntry | undefined {
  const hit = entries.get(path);
  if (hit) return hit;
  // Part names are conventionally lower-case but the spec doesn't require it.
  const lower = path.toLowerCase();
  for (const [name, entry] of entries) if (name.toLowerCase() === lower) return entry;
  return undefined;
}

/**
 * Every visible sheet in the workbook, in tab order, with its first non-empty
 * row taken as the header. Sheets are returned even when empty so the caller
 * can say "that sheet has no rows" instead of silently skipping it.
 */
export async function parseXlsx(file: Blob): Promise<SheetData[]> {
  if (!supportsInflate()) {
    throw new SpreadsheetError("This browser can't unpack .xlsx files. Import a CSV instead, or use an up-to-date browser.");
  }

  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 4));
  // D0 CF 11 E0 is the OLE2 container the pre-2007 .xls format used.
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    throw new SpreadsheetError("That's a legacy .xls file. Open it in Excel and save as .xlsx or CSV, then import that.");
  }
  if (head[0] !== 0x50 || head[1] !== 0x4b) {
    throw new SpreadsheetError("That file isn't a spreadsheet the importer can read. Use .xlsx or .csv.");
  }

  const entries = readZipIndex(buf);
  const workbookEntry = findEntry(entries, "xl/workbook.xml");
  if (!workbookEntry) throw new SpreadsheetError("That .xlsx file has no workbook in it. Try re-saving it from Excel.");

  const workbookXml = await readEntry(buf, workbookEntry);
  const relsEntry = findEntry(entries, "xl/_rels/workbook.xml.rels");
  const relsXml = relsEntry ? await readEntry(buf, relsEntry) : "";
  const date1904 = /date1904="(?:1|true)"/.test(workbookXml);

  const stringsEntry = findEntry(entries, "xl/sharedStrings.xml");
  const shared = stringsEntry ? parseSharedStrings(await readEntry(buf, stringsEntry)) : [];
  const stylesEntry = findEntry(entries, "xl/styles.xml");
  const styles = stylesEntry ? parseStyles(await readEntry(buf, stylesEntry)) : [];

  let refs = listSheets(workbookXml, relsXml);
  if (refs.length === 0) {
    // No usable relationships: fall back to the conventional part names, which
    // is what a workbook written by anything other than Excel usually uses.
    refs = [...entries.keys()]
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
      .sort()
      .map((path, i) => ({ name: `Sheet${i + 1}`, path }));
  }
  if (refs.length === 0) throw new SpreadsheetError("That workbook has no sheets the importer can read.");

  const out: SheetData[] = [];
  for (const ref of refs) {
    const entry = findEntry(entries, ref.path);
    if (!entry) continue;
    const grid = parseSheetXml(await readEntry(buf, entry), shared, styles, date1904);
    const filled = grid.filter((r) => r.some((cell) => cell.trim() !== ""));
    const [headers = [], ...body] = filled;
    out.push({ name: ref.name, headers: headers.map((h) => h.trim()), rows: body });
  }
  return out;
}
