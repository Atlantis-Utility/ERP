// Client-side table export. Every page that lists data hands the same four
// things — a filename, a title, the headings, and the rows it is showing —
// and gets CSV, Excel, Word or PDF out of it.
//
// The rows are the ones on screen, already filtered and sorted, so an export
// is what you were looking at rather than a fresh query that might disagree.
//
// Every writer is loaded on demand: jsPDF, docx and the xlsx writer together
// are larger than the page they would be exporting from, and most visits
// never export anything.

export type ExportFormat = "csv" | "excel" | "word" | "pdf";

export interface ExportTable {
  /** Without an extension — each format adds its own. */
  filename: string;
  /** Printed above the table in Word and PDF, which have room for it. */
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export const EXPORT_FORMATS: { id: ExportFormat; label: string; extension: string }[] = [
  { id: "csv", label: "CSV", extension: "csv" },
  { id: "excel", label: "Excel", extension: "xlsx" },
  { id: "word", label: "Word", extension: "docx" },
  { id: "pdf", label: "PDF", extension: "pdf" },
];

function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Safe on every filesystem, and recognisable afterwards. */
export function exportFilename(name: string): string {
  return (
    name
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "export"
  );
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  downloadBlob(filename, new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }));
}

export async function exportToExcel(filename: string, headers: string[], rows: (string | number)[][]) {
  // The browser entry point: the package's default export is the Node one,
  // which reaches for fs.
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const sheet = [
    headers.map((h) => ({ value: h, fontWeight: "bold" as const, backgroundColor: "#F2F2F2" })),
    // Numbers stay numbers so a spreadsheet can total a column; everything
    // else goes as text, because a zip code or an extension that Excel
    // decides is a number loses its leading zero.
    ...rows.map((row) =>
      row.map((cell) =>
        typeof cell === "number" ? { value: cell, type: Number } : { value: String(cell ?? ""), type: String },
      ),
    ),
  ];
  const widths = headers.map((h, i) => ({
    width: Math.min(48, Math.max(10, h.length + 2, ...rows.slice(0, 200).map((r) => String(r[i] ?? "").length + 2))),
  }));
  await writeXlsxFile(sheet, { columns: widths, sheet: "Data" }).toFile(filename);
}

export async function exportToWord(
  filename: string,
  title: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, WidthType, AlignmentType } =
    await import("docx");

  const cell = (text: string, bold = false) =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18 })] })],
      shading: bold ? { fill: "F2F2F2" } : undefined,
    });

  const doc = new Document({
    sections: [
      {
        // Landscape, because a table of a dozen columns down a portrait page
        // is a column of initials.
        properties: { page: { size: { orientation: "landscape" as const } } },
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun({
                text: `${rows.length.toLocaleString()} rows · ${new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}`,
                color: "767676",
                size: 18,
              }),
            ],
            alignment: AlignmentType.LEFT,
          }),
          new Paragraph({ text: "" }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: headers.map((h) => cell(h, true)), tableHeader: true }),
              ...rows.map((row) => new TableRow({ children: row.map((value) => cell(String(value ?? ""))) })),
            ],
          }),
        ],
      },
    ],
  });
  downloadBlob(filename, await Packer.toBlob(doc));
}

export async function exportToPdf(
  filename: string,
  title: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const [{ default: jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${rows.length.toLocaleString()} rows · ${new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })}`,
    14,
    21,
  );
  autoTable(doc, {
    head: [headers],
    body: rows.map((row) => row.map((cell) => String(cell ?? ""))),
    startY: 26,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [10, 10, 10] },
  });
  doc.save(filename);
}

/**
 * How many rows a document format will take.
 *
 * CSV and Excel are files of data and scale with the list; Word and PDF lay
 * every row out as a rendered table row, and 20,000 of those is a document
 * nobody opens and a tab that stops responding while it tries. Measured on
 * the leads list: 20,162 rows took jsPDF past a minute without finishing,
 * while Excel wrote the same rows in under one.
 */
export const DOCUMENT_ROW_LIMIT = 5000;

export function tooManyRowsFor(format: ExportFormat, rows: number): boolean {
  return (format === "pdf" || format === "word") && rows > DOCUMENT_ROW_LIMIT;
}

/** One way in, whatever the format. */
export async function exportTable(format: ExportFormat, table: ExportTable): Promise<void> {
  const base = exportFilename(table.filename);
  const rows = table.rows;
  if (format === "csv") return exportToCsv(`${base}.csv`, table.headers, rows);
  if (format === "excel") return exportToExcel(`${base}.xlsx`, table.headers, rows);
  if (format === "word") return exportToWord(`${base}.docx`, table.title, table.headers, rows);
  return exportToPdf(`${base}.pdf`, table.title, table.headers, rows);
}
