"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "md" | "lg";
}

export default function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "md",
}: DrawerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel — full-bleed on phones, fixed width once there's room for it */}
      <div
        className={`absolute right-0 top-0 h-full w-full bg-white border-l border-[#eaeaea] shadow-2xl flex flex-col ${
          width === "lg" ? "sm:max-w-150" : "sm:max-w-120"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 sm:py-5 border-b border-[#eaeaea] shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#0a0a0a] wrap-break-word">{title}</h2>
            {subtitle && <p className="text-xs text-[#999] mt-0.5 wrap-break-word">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 shrink-0 rounded-lg text-[#999] hover:bg-[#f1f1f1] hover:text-[#0a0a0a] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">{children}</div>

        {/* Footer — buttons stretch full width when they'd otherwise be cramped */}
        {footer && (
          <div className="shrink-0 border-t border-[#eaeaea] px-4 sm:px-6 py-4 flex flex-wrap items-center justify-end gap-2 sm:gap-3 [&>button]:flex-1 sm:[&>button]:flex-none">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
