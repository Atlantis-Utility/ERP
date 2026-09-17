"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
  /**
   * Hides the button until the row is hovered (or this button is focused, so
   * it stays keyboard-reachable).
   *
   * Off by default: the customers pages show it permanently and their rows
   * carry no `group` class, so defaulting this on would leave those buttons
   * invisible. Opt in from dense tables where an icon on every cell of every
   * row is noise, and give the row `group`.
   */
  revealOnHover?: boolean;
}

/** Copies a value to the clipboard and confirms it in place. */
export default function CopyButton({
  value,
  label,
  className = "",
  revealOnHover = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A row can unmount while the tick is still showing (a filter change, a
  // live update), and setting state afterwards would be a leak.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!value) return null;

  async function handleCopy(e: React.MouseEvent) {
    // These sit inside clickable rows and cells: copying shouldn't also open
    // the record behind them.
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused (insecure origin, denied permission).
      // Nothing useful to say beyond not claiming success.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied" : label ? `Copy ${label}` : "Copy"}
      aria-label={copied ? "Copied" : label ? `Copy ${label}` : "Copy"}
      className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[#999] hover:text-[#0070f3] hover:bg-[#f1f5f9] transition-colors shrink-0 ${
        revealOnHover ? "opacity-0 group-hover:opacity-100 focus:opacity-100" : ""
      } ${className}`}
    >
      {copied ? <Check className="w-3 h-3 text-[#17c964]" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}
