"use client";

import { useRef, useState } from "react";
import { Download, Loader2, FileSpreadsheet, FileText, FileType, Sheet } from "lucide-react";
import FloatingLayer from "@/components/ui/FloatingLayer";
import { exportTable, tooManyRowsFor, DOCUMENT_ROW_LIMIT, type ExportFormat, type ExportTable } from "@/lib/export";
import { getErrorMessage } from "@/lib/utils";
import { useToast } from "@/lib/toast";

/**
 * Download what this page is showing, as CSV, Excel, Word or PDF.
 *
 * One component for every list in the app, so the choice is the same
 * wherever somebody looks for it, and a page only has to say what its rows
 * are. `data` is a function rather than a value because several pages hold
 * one page of rows on screen and have to go and fetch the rest before they
 * can export the lot.
 *
 * Floating, because a list usually sits inside something that scrolls, and
 * a menu clipped by its own table is no menu at all.
 */
const ICONS: Record<ExportFormat, typeof FileText> = {
  csv: FileSpreadsheet,
  excel: Sheet,
  word: FileType,
  pdf: FileText,
};

function refusal(format: ExportFormat, rows: number): string {
  return (
    `${rows.toLocaleString()} rows is more than a ${LABELS[format]} document holds ` +
    `(${DOCUMENT_ROW_LIMIT.toLocaleString()}). Narrow the list, or take it as CSV or Excel.`
  );
}

const LABELS: Record<ExportFormat, string> = {
  csv: "CSV",
  excel: "Excel",
  word: "Word",
  pdf: "PDF",
};

export default function ExportMenu({
  data,
  rowCount,
  disabled,
  label = "Export",
  className,
}: {
  data: () => ExportTable | Promise<ExportTable>;
  /**
   * How many rows this will be, when the page already knows — a list that
   * pages its rows from the server knows its total before fetching them.
   * Lets a document format be refused straight away instead of after a
   * minute of fetching.
   */
  rowCount?: number;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { success, error: toastError } = useToast();

  async function run(format: ExportFormat) {
    setOpen(false);
    if (rowCount !== undefined && tooManyRowsFor(format, rowCount)) {
      toastError(refusal(format, rowCount));
      return;
    }
    setBusy(format);
    try {
      const table = await data();
      if (table.rows.length === 0) {
        toastError("Nothing to export.");
        return;
      }
      // Refused rather than truncated: half a list that says nothing about
      // the half it left out is worse than no file.
      if (tooManyRowsFor(format, table.rows.length)) {
        toastError(refusal(format, table.rows.length));
        return;
      }
      await exportTable(format, table);
      success(`Exported ${table.rows.length.toLocaleString()} rows as ${LABELS[format]}.`);
    } catch (err) {
      toastError(getErrorMessage(err, `Couldn't export as ${LABELS[format]}`));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || busy !== null}
        onClick={() => setOpen((o) => !o)}
        className={
          className ??
          "flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[13px] font-medium text-[#444] px-3 py-2 rounded-md hover:bg-[#fafafa] transition-colors disabled:opacity-40"
        }
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">{label}</span>
      </button>

      {open && (
        <FloatingLayer anchorRef={triggerRef} width={168} onClose={() => setOpen(false)}>
          {(Object.keys(LABELS) as ExportFormat[]).map((format) => {
            const Icon = ICONS[format];
            return (
              <button
                key={format}
                type="button"
                onClick={() => run(format)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-[#444] hover:bg-[#fafafa] transition-colors"
              >
                <Icon className="w-3.5 h-3.5 text-[#999] shrink-0" />
                {LABELS[format]}
              </button>
            );
          })}
        </FloatingLayer>
      )}
    </>
  );
}
