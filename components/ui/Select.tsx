"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, Search, X } from "lucide-react";
import FloatingLayer from "./FloatingLayer";

export interface SelectOption {
  value: string;
  label: string;
  /**
   * Renders in red, below a divider, for an option that does something
   * destructive rather than simply setting a value. Keeps an action like
   * "delete" with the control it belongs to instead of needing a button of
   * its own beside it.
   */
  danger?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  // Opt-in only, every existing call site keeps its plain dropdown behavior
  // unless it explicitly asks for the search box (useful once the option
  // list gets long, e.g. picking a customer).
  searchable?: boolean;
  // Opt-in only. Shows a small X in the closed control once a value is
  // selected, clicking it resets to the placeholder/unselected state
  // without opening the option list.
  clearable?: boolean;
  /**
   * "cell" strips the border and padding so the control can sit in a
   * spreadsheet cell and read as part of the grid, the way a value does in
   * Excel until you click it.
   */
  variant?: "control" | "cell";
  /**
   * Renders the option list in a portal, positioned against the trigger.
   * On by default: an absolutely positioned list is clipped by any scrolling
   * ancestor, and most of this app's selects sit in one, a modal body, a
   * drawer, a table viewport. Pass `floating={false}` for a control on a
   * static page that should keep the list in flow.
   */
  floating?: boolean;
  /**
   * Adds a "Custom" action to the bottom of the list for a value the list
   * doesn't have. A value already set that way is shown as the selected
   * entry, so it doesn't look like nothing is selected.
   */
  allowCustom?: boolean;
  /** Placeholder for the custom-value box. */
  customPlaceholder?: string;
  /**
   * Shows a value that isn't in the option list as the selected one instead
   * of falling back to the placeholder. For a stored value from a list that
   * has since changed, the alternative reads as "nothing is set", and saving
   * the row would then quietly clear it. Implied by allowCustom.
   */
  showUnlistedValue?: boolean;
}

// Custom dropdown replacing native <select>: the browser renders a native
// select's open option list itself (OS-styled, blue highlight), which can't
// be restyled with CSS. This keeps full control over both closed and open
// states so it matches the rest of the app consistently.
export default function Select({
  value,
  onChange,
  options,
  placeholder,
  className = "",
  disabled,
  id,
  searchable = false,
  clearable = false,
  variant = "control",
  floating = true,
  allowCustom = false,
  customPlaceholder = "Type a value",
  showUnlistedValue = false,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const customRef = useRef<HTMLInputElement>(null);

  const isCell = variant === "cell";
  const listed = options.find((o) => o.value === value);
  // A value that isn't in the list is a custom one, and has to be offered as
  // the selected option or the trigger would show the placeholder over it.
  const custom: SelectOption | null =
    (allowCustom || showUnlistedValue) && !listed && value !== "" ? { value, label: value } : null;
  const selected = listed ?? custom;
  const allOptions = custom ? [custom, ...options] : options;
  const visibleOptions =
    searchable && query.trim()
      ? allOptions.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
      : allOptions;

  function close() {
    setOpen(false);
    setCustomOpen(false);
  }

  function commitCustom() {
    const next = draft.trim();
    if (next) onChange(next);
    close();
  }

  useEffect(() => {
    if (!open) return;
    if (searchable) searchRef.current?.focus();
    // When floating, the list lives in a portal outside this subtree, so
    // dismissal is FloatingLayer's job: a "click outside rootRef" test here
    // would close the menu on mousedown before the option's click landed.
    if (floating) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, searchable, floating]);

  useEffect(() => {
    if (customOpen) customRef.current?.focus();
  }, [customOpen]);

  const menu = (
    <div
      className={`bg-white border border-[#eaeaea] rounded-lg shadow-lg py-1 ${
        floating ? "" : "absolute z-50 left-0 right-0 mt-1.5 max-h-64 overflow-y-auto"
      }`}
    >
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
      {visibleOptions.length === 0 && !allowCustom ? (
        <p className={`text-[#bbb] ${isCell ? "px-2.5 py-1.5 text-[12px]" : "px-3 py-2 text-sm"}`}>No matches</p>
      ) : (
        visibleOptions.map((opt, i) => {
          const isSelected = opt.value === value;
          // A divider above the first destructive option separates "set this
          // value" from "do this thing".
          const startsDangerGroup = opt.danger && !visibleOptions[i - 1]?.danger;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                close();
              }}
              className={`w-full flex items-center justify-between gap-2 text-left transition-colors ${
                isCell ? "px-2.5 py-1.5 text-[12px]" : "px-3 py-2 text-sm"
              } ${startsDangerGroup ? "mt-1 border-t border-[#f0f0f0] pt-2" : ""} ${
                opt.danger
                  ? "text-[#f31260] hover:bg-[#fef2f2]"
                  : isSelected
                    ? "bg-[#f5f5f5] text-[#0a0a0a] font-medium"
                    : "text-[#444] hover:bg-[#fafafa]"
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {isSelected && !opt.danger && <Check className="w-3.5 h-3.5 text-[#0070f3] shrink-0" />}
            </button>
          );
        })
      )}

      {allowCustom && (
        <div className="border-t border-[#f5f5f5] mt-1 pt-1">
          {customOpen ? (
            <div className="px-2 py-1">
              <input
                ref={customRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitCustom();
                  }
                }}
                placeholder={customPlaceholder}
                className="w-full border border-[#eaeaea] rounded-md px-2 py-1.5 text-[12px] focus:outline-none focus:border-[#0070f3] transition-colors"
              />
              <div className="flex items-center gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={commitCustom}
                  disabled={!draft.trim()}
                  className="flex-1 text-[11px] font-semibold bg-[#0a0a0a] text-white py-1.5 rounded-md hover:bg-[#333] transition-colors disabled:opacity-40"
                >
                  Use this
                </button>
                <button
                  type="button"
                  onClick={() => setCustomOpen(false)}
                  className="text-[11px] font-medium text-[#666] px-2 py-1.5 rounded-md hover:bg-[#f5f5f5] transition-colors"
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(custom ? custom.value : query.trim());
                setCustomOpen(true);
              }}
              className={`w-full flex items-center gap-2 text-left text-[#666] hover:bg-[#fafafa] transition-colors ${
                isCell ? "px-2.5 py-1.5 text-[12px]" : "px-3 py-2 text-sm"
              }`}
            >
              <Pencil className="w-3 h-3 shrink-0 text-[#999]" />
              <span className="truncate">Custom, type it in</span>
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div ref={rootRef} className={isCell ? "relative h-full" : "relative"}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          // Cleared here rather than in an effect on `open`: the search box
          // should start empty each time the list is opened, and doing it
          // from the event avoids a second render pass.
          setQuery("");
          setOpen(true);
        }}
        className={
          isCell
            ? `w-full h-full flex items-center justify-between gap-1 px-1 text-[12px] text-left bg-transparent transition-colors focus:outline-none disabled:opacity-50 ${
                open ? "bg-[#eff6ff]" : "hover:bg-[#f5f5f5]"
              } ${className}`
            : `w-full flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm text-left bg-white transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                open ? "border-[#0070f3]" : "border-[#eaeaea] hover:border-[#d4d4d4]"
              } ${className}`
        }
      >
        <span className={`truncate ${selected ? "text-[#0a0a0a]" : "text-[#bbb]"}`}>
          {selected ? selected.label : (placeholder ?? "Select…")}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {clearable && selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  onChange("");
                }
              }}
              className="p-0.5 rounded hover:bg-[#f0f0f0] text-[#999] hover:text-[#666] transition-colors"
              aria-label="Clear selection"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown
            className={`${isCell ? "w-3 h-3" : "w-3.5 h-3.5"} text-[#999] transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open &&
        (floating ? (
          <FloatingLayer anchorRef={triggerRef} onClose={close} minWidth={200}>
            {menu}
          </FloatingLayer>
        ) : (
          menu
        ))}
    </div>
  );
}
