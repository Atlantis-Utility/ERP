"use client";

import type { LeadGrantLevel } from "@/lib/db/lead-grants";

const LEVELS: { value: LeadGrantLevel; label: string }[] = [
  { value: "viewer", label: "Read-only" },
  { value: "editor", label: "Can edit" },
];

/**
 * Read-only / Can edit, as a two-state segmented control, the app's own
 * pattern (see the view switcher on the Leads page): a grey track with the
 * active option lifted onto white.
 *
 * Small enough to sit inline on a list row, which is what lets an access
 * level stay editable in place instead of needing a dropdown or a second
 * dialog per person.
 */
export default function LevelToggle({
  value,
  onChange,
  disabled,
  size = "sm",
}: {
  value: LeadGrantLevel;
  onChange: (level: LeadGrantLevel) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div className={`flex items-center gap-0.5 bg-[#f5f5f5] rounded-md shrink-0 ${size === "sm" ? "p-0.5" : "p-1"}`}>
      {LEVELS.map((l) => (
        <button
          key={l.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(l.value)}
          className={`text-[11px] font-medium rounded transition-colors disabled:opacity-50 ${
            size === "sm" ? "px-2 py-1" : "px-2.5 py-1.5"
          } ${value === l.value ? "bg-white text-[#0a0a0a] shadow-sm" : "text-[#999] hover:text-[#666]"}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
