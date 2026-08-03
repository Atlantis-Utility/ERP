"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

interface DownloadMenuProps {
  onExportCsv: () => void;
  onExportPdf: () => void;
  disabled?: boolean;
}

export default function DownloadMenu({ onExportCsv, onExportPdf, disabled }: DownloadMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-3.5 py-2 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
      >
        <Download className="w-3.5 h-3.5" />
        Download
      </button>

      {open && (
        <div className="absolute z-50 right-0 mt-1.5 w-40 bg-white border border-[#eaeaea] rounded-lg shadow-lg py-1">
          <button
            type="button"
            onClick={() => { setOpen(false); onExportCsv(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-[#444] hover:bg-[#fafafa] transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#999]" />
            Export as CSV
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onExportPdf(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-[#444] hover:bg-[#fafafa] transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-[#999]" />
            Export as PDF
          </button>
        </div>
      )}
    </div>
  );
}
