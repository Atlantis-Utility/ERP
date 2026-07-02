"use client";

import { useEffect } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";

interface Props {
  open:        boolean;
  title:       string;
  description: string;
  confirmLabel?: string;
  onConfirm:   () => void;
  onCancel:    () => void;
  loading?:    boolean;
  variant?:    "danger" | "warning";
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
  loading = false,
  variant = "danger",
}: Props) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const isDanger = variant === "danger";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl border border-[#eaeaea] shadow-2xl w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${
          isDanger ? "bg-[#fff0f0] border border-[#fecaca]" : "bg-[#fffbeb] border border-[#fde68a]"
        }`}>
          {isDanger
            ? <Trash2 className="w-5 h-5 text-[#dc2626]" />
            : <AlertTriangle className="w-5 h-5 text-[#b45309]" />
          }
        </div>

        <h2 className="text-base font-semibold text-[#0a0a0a] mb-1.5">{title}</h2>
        <p className="text-sm text-[#666] leading-relaxed mb-6">{description}</p>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 border border-[#eaeaea] bg-white text-sm font-medium text-[#444] py-2.5 rounded-xl hover:bg-[#fafafa] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 text-white text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50 ${
              isDanger
                ? "bg-[#dc2626] hover:bg-[#b91c1c]"
                : "bg-[#b45309] hover:bg-[#92400e]"
            }`}
          >
            {loading ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
