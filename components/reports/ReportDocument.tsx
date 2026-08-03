"use client";

import Link from "next/link";
import { ArrowLeft, Download, FileType } from "lucide-react";

interface ReportDocumentProps {
  backHref: string;
  backLabel: string;
  reportLabel: string;
  title: string;
  subtitle?: string;
  onDownloadPdf: () => void;
  onDownloadWord: () => void;
  children: React.ReactNode;
}

export default function ReportDocument({
  backHref, backLabel, reportLabel, title, subtitle, onDownloadPdf, onDownloadWord, children,
}: ReportDocumentProps) {
  return (
    <div className="pb-16">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm text-[#666] hover:text-[#0a0a0a] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={onDownloadWord}
            className="flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
          >
            <FileType className="w-4 h-4" />
            Download Word
          </button>
          <button
            onClick={onDownloadPdf}
            className="flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>
      </div>

      {/* Document */}
      <div className="max-w-4xl mx-auto bg-white border border-[#eaeaea] rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-[#0a0a0a] to-[#333]" />
        <div className="p-10 md:p-14">
          {/* Letterhead */}
          <div className="flex items-start justify-between gap-6 pb-6 mb-8 border-b border-[#eaeaea]">
            <div>
              <p className="text-lg font-bold tracking-tight text-[#0a0a0a]">Atlantis Utility</p>
              <p className="text-[11px] text-[#999] mt-0.5">Internal Operations Report</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest">{reportLabel}</p>
              <p className="text-[11px] text-[#bbb] mt-1">
                Generated {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>

          {/* Title */}
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-[#0a0a0a] leading-tight">{title}</h1>
            {subtitle && <p className="text-sm text-[#666] mt-1.5 leading-relaxed">{subtitle}</p>}
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
