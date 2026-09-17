"use client";

import { useState } from "react";
import Overlay from "@/components/ui/Overlay";
import { X, Loader2, UserCheck, Eye, Pencil, Check } from "lucide-react";
import Select from "@/components/ui/Select";
import { useEmployees } from "@/lib/db/employees";
import { assignLeadsBulk, type BulkTarget } from "@/lib/db/leads";
import { grantLeadAccessBulk, type LeadGrantLevel } from "@/lib/db/lead-grants";
import type { ActivityActor } from "@/lib/db/lead-activity";
import { getAvatarColor, getInitials, getErrorMessage } from "@/lib/utils";

type Mode = "assign" | "share";

/**
 * Bulk owner assignment and bulk access sharing for the leads picked in the
 * table. Administrator-only, both operations are refused by the database for
 * anyone else (the reassignment trigger and the lead_grants policies in
 * supabase/migration-record-access.sql), so the caller gates on
 * useLeadsAccess().canAssign rather than this hiding a control that would
 * otherwise half-work.
 */
export default function AssignLeadsModal({
  target,
  count,
  actor,
  onClose,
  onDone,
}: {
  /** Either explicit ids, or "everything matching the current filters". */
  target: BulkTarget;
  /** How many leads that works out to, for the wording. */
  count: number;
  actor: ActivityActor | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const employees = useEmployees();
  const [mode, setMode] = useState<Mode>("assign");
  const [employeeId, setEmployeeId] = useState("");
  const [level, setLevel] = useState<LeadGrantLevel>("viewer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = employees.find((e) => e.id === employeeId);
  const plural = count !== 1 ? "s" : "";

  async function submit() {
    setError("");

    if (mode === "share" && !employeeId) {
      setError("Pick who should get access.");
      return;
    }

    setSaving(true);
    try {
      if (mode === "assign") {
        // No employee picked means "unassign", which is a legitimate action:
        // it returns leads to the admin-only pool.
        const changed = await assignLeadsBulk(
          target,
          selected ? { id: selected.id, name: selected.name } : null,
          actor,
        );
        // Reports what the database actually did. Leads already owned by that
        // person aren't counted, and reassignment is administrator-only, so a
        // member gets a truthful zero rather than a false success.
        onDone(
          changed === 0
            ? "No leads changed owner, they may already be assigned to that person, or you may not have permission to reassign."
            : selected
              ? `Assigned ${changed.toLocaleString()} lead${changed !== 1 ? "s" : ""} to ${selected.name}.`
              : `Unassigned ${changed.toLocaleString()} lead${changed !== 1 ? "s" : ""}.`,
        );
      } else {
        const granted = await grantLeadAccessBulk(target, employeeId, level, actor);
        onDone(
          `Gave ${selected?.name ?? "them"} ${level === "viewer" ? "read-only" : "edit"} access to ${granted.toLocaleString()} lead${granted !== 1 ? "s" : ""}.`,
        );
      }
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update access"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onDismiss={onClose} className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      dismissable={!saving}>
      <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#eaeaea]">
          <div>
            <p className="text-sm font-semibold text-[#0a0a0a]">
              {mode === "assign" ? "Assign leads" : "Share access"}
            </p>
            <p className="text-xs text-[#999] mt-0.5">
              {count.toLocaleString()} lead{plural} selected
              {target.kind === "filters" && " (everything matching your filters)"}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#f5f5f5] transition-colors text-[#999]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex items-center gap-1 p-1 bg-[#f5f5f5] rounded-lg">
            {[
              { value: "assign" as Mode, label: "Assign owner", icon: UserCheck },
              { value: "share" as Mode, label: "Share access", icon: Eye },
            ].map((t) => (
              <button
                key={t.value}
                onClick={() => {
                  setMode(t.value);
                  setError("");
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                  mode === t.value ? "bg-white text-[#0a0a0a] shadow-sm" : "text-[#666] hover:text-[#0a0a0a]"
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-[#666] leading-relaxed">
            {mode === "assign"
              ? "The owner is the one person responsible for working the lead. Assigning it makes the lead visible to them and hides it from everyone else except administrators."
              : "Sharing adds people alongside the owner. Read-only lets them see the lead without changing anything; edit lets them work it like the owner."}
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">
              {mode === "assign" ? "Owner" : "Give access to"}
            </label>
            <Select
              value={employeeId}
              onChange={setEmployeeId}
              placeholder={mode === "assign" ? "Unassigned" : "Pick a teammate"}
              options={employees.map((e) => ({ value: e.id, label: e.name }))}
              searchable
              clearable={mode === "assign"}
            />
            {selected && (
              <div className="flex items-center gap-2 mt-1">
                <div
                  className={`w-6 h-6 rounded-full ${getAvatarColor(selected.name).bg} ${getAvatarColor(selected.name).text} flex items-center justify-center shrink-0`}
                >
                  <span className="text-[9px] font-semibold">{getInitials(selected.name)}</span>
                </div>
                <span className="text-xs text-[#666] truncate">{selected.role || selected.email}</span>
              </div>
            )}
          </div>

          {mode === "share" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Access level</label>
              <div className="space-y-1.5">
                {[
                  {
                    value: "viewer" as LeadGrantLevel,
                    label: "Read-only",
                    hint: "Can see the lead and its history. Cannot change anything.",
                    icon: Eye,
                  },
                  {
                    value: "editor" as LeadGrantLevel,
                    label: "Can edit",
                    hint: "Can update stage, contact details and notes, like the owner.",
                    icon: Pencil,
                  },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setLevel(opt.value)}
                    className={`w-full flex items-start gap-2.5 text-left px-3 py-2.5 rounded-lg border transition-colors ${
                      level === opt.value ? "border-[#0070f3] bg-[#eff6ff]" : "border-[#eaeaea] hover:bg-[#fafafa]"
                    }`}
                  >
                    <opt.icon
                      className={`w-4 h-4 mt-0.5 shrink-0 ${level === opt.value ? "text-[#0070f3]" : "text-[#999]"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-[#0a0a0a]">{opt.label}</span>
                      <span className="block text-[11px] text-[#999] mt-0.5">{opt.hint}</span>
                    </span>
                    {level === opt.value && <Check className="w-3.5 h-3.5 text-[#0070f3] shrink-0 mt-0.5" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-[#f31260]">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#eaeaea]">
          <button
            onClick={onClose}
            className="text-sm border border-[#eaeaea] bg-white text-[#0a0a0a] font-medium px-4 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || count === 0}
            className="text-sm bg-[#0070f3] text-white font-medium px-4 py-1.5 rounded-lg hover:bg-[#005fcc] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {mode === "assign" ? "Assign" : "Grant access"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
