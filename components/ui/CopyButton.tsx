"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export default function CopyButton({ value, label, className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label ? `Copy ${label}` : "Copy"}
      className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[#999] hover:text-[#0070f3] hover:bg-[#f1f5f9] transition-colors shrink-0 ${className}`}
    >
      {copied ? <Check className="w-3 h-3 text-[#17c964]" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}
