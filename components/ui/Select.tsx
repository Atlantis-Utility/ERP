"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  // Opt-in only — every existing call site keeps its plain dropdown
  // behavior unless it explicitly asks for the search box (useful once the
  // option list gets long, e.g. picking a customer).
  searchable?: boolean;
}

// Custom dropdown replacing native <select>: the browser renders a native
// select's open option list itself (OS-styled, blue highlight), which can't
// be restyled with CSS. This keeps full control over both closed and open
// states so it matches the rest of the app consistently.
export default function Select({ value, onChange, options, placeholder, className = "", disabled, id, searchable = false }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);
  const visibleOptions = searchable && query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    if (searchable) searchRef.current?.focus();
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
  }, [open, searchable]);

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm text-left bg-white transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
          open ? "border-[#0070f3]" : "border-[#eaeaea] hover:border-[#d4d4d4]"
        } ${className}`}
      >
        <span className={`truncate ${selected ? "text-[#0a0a0a]" : "text-[#bbb]"}`}>
          {selected ? selected.label : placeholder ?? "Select…"}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-[#999] shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-[#eaeaea] rounded-lg shadow-lg py-1 max-h-64 overflow-y-auto">
          {searchable && (
            <div className="sticky top-0 bg-white px-2 pb-1.5 pt-0.5 border-b border-[#f5f5f5] mb-1">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#bbb] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Search…"
                  className="w-full border border-[#eaeaea] rounded-md pl-8 pr-2 py-1.5 text-sm focus:outline-none focus:border-[#0070f3] transition-colors"
                />
              </div>
            </div>
          )}
          {visibleOptions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[#bbb]">No matches</p>
          ) : (
            visibleOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    isSelected ? "bg-[#f5f5f5] text-[#0a0a0a] font-medium" : "text-[#444] hover:bg-[#fafafa]"
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#0070f3] shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
