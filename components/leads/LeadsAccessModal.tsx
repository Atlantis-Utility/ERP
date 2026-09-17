"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Plus } from "lucide-react";
import Select from "@/components/ui/Select";
import LevelToggle from "@/components/leads/LevelToggle";
import { useEmployees } from "@/lib/db/employees";
import {
  useGlobalLeadGrants,
  fetchGrantCounts,
  grantLeadAccess,
  revokeLeadGrant,
  type LeadGrant,
  type LeadGrantLevel,
} from "@/lib/db/lead-grants";
import type { ActivityActor } from "@/lib/db/lead-activity";
import { getAvatarColor, getInitials, getErrorMessage } from "@/lib/utils";

/**
 * Access to every lead, for a manager or analyst who needs oversight without
 * owning anything. Separate from per-lead sharing (LeadAccessPanel) because
 * it's a standing permission, and because revoking it has to be possible from
 * one place instead of hunting through leads.
 *
 * Administrator-only; the lead_grants policies refuse these writes for anyone
 * else regardless of this dialog being open.
 */
export default function LeadsAccessModal({ actor, onClose }: { actor: ActivityActor | null; onClose: () => void }) {
  const employees = useEmployees();
  const globalGrants = useGlobalLeadGrants();
  const [employeeId, setEmployeeId] = useState("");
  const [level, setLevel] = useState<LeadGrantLevel>("viewer");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // How many individual leads each person has been shared into, shown inline
  // on their row rather than as its own section. Counted in SQL: the
  // underlying rows can run to thousands once a filter-wide share is used.
  const [perLeadCounts, setPerLeadCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetchGrantCounts()
      .then((counts) => {
        if (!cancelled) setPerLeadCounts(counts);
      })
      .catch((err) => console.error("[lead_grants] count failed:", err));
    return () => {
      cancelled = true;
    };
    // Recounted whenever the all-leads grants change, which is the signal that
    // someone has been in here granting or revoking.
  }, [globalGrants]);

  const granted = new Set(globalGrants.map((g) => g.employeeId));
  const options = employees.filter((e) => !granted.has(e.id)).map((e) => ({ value: e.id, label: e.name }));

  const employeeFor = (id: string) => employees.find((e) => e.id === id);

  async function grant(targetId: string, targetLevel: LeadGrantLevel, busyKey: string) {
    setBusyId(busyKey);
    setError("");
    try {
      await grantLeadAccess({ leadId: null, employeeId: targetId, level: targetLevel }, actor);
      if (busyKey === "new") {
        setEmployeeId("");
        setLevel("viewer");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update access"));
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(g: LeadGrant) {
    setBusyId(g.id);
    setError("");
    try {
      await revokeLeadGrant(g, actor);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to revoke access"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#0a0a0a] tracking-tight">Lead access</h2>
            <p className="text-[13px] text-[#999] mt-0.5">Give someone every lead without assigning any to them.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mt-1 -mr-1.5 rounded-md text-[#999] hover:text-[#0a0a0a] hover:bg-[#f5f5f5] transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add row, one line, no section header: it is the primary action. */}
        <div className="px-6 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <Select
                value={employeeId}
                onChange={setEmployeeId}
                placeholder="Add a teammate…"
                options={options}
                searchable
                disabled={options.length === 0}
              />
            </div>
            <LevelToggle value={level} onChange={setLevel} size="md" />
            <button
              onClick={() => employeeId && grant(employeeId, level, "new")}
              disabled={!employeeId || busyId === "new"}
              className="flex items-center gap-1.5 text-[13px] font-medium bg-[#0a0a0a] text-white px-3.5 py-2 rounded-md hover:bg-[#333] transition-colors disabled:opacity-40 shrink-0"
            >
              {busyId === "new" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </button>
          </div>
          {options.length === 0 && employees.length > 0 && (
            <p className="text-[11px] text-[#bbb] mt-2">Everyone already has access to all leads.</p>
          )}
        </div>

        <div className="border-t border-[#f0f0f0] overflow-y-auto flex-1">
          {globalGrants.length === 0 ? (
            <p className="px-6 py-8 text-[13px] text-[#999] text-center">
              Nobody has blanket access. Everyone sees only the leads assigned to them.
            </p>
          ) : (
            <ul className="divide-y divide-[#f4f4f4]">
              {globalGrants.map((g) => {
                const employee = employeeFor(g.employeeId);
                const name = employee?.name ?? "Unknown teammate";
                const colors = getAvatarColor(name);
                const shared = perLeadCounts.get(g.employeeId) ?? 0;
                const busy = busyId === g.id;
                return (
                  <li
                    key={g.id}
                    className="group flex items-center gap-3 px-6 py-3 hover:bg-[#fafafa] transition-colors"
                  >
                    <div
                      className={`w-8 h-8 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center shrink-0`}
                    >
                      <span className="text-[11px] font-semibold">{getInitials(name)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-[#0a0a0a] truncate">{name}</p>
                      <p className="text-[11px] text-[#999] truncate">
                        {[
                          employee?.role,
                          shared > 0 && `${shared.toLocaleString()} lead${shared !== 1 ? "s" : ""} shared individually`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {/* Switchable in place, re-granting replaces the row, so
                        this is the same operation as adding. */}
                    <LevelToggle
                      value={g.level}
                      disabled={busy}
                      onChange={(next) => {
                        if (next !== g.level) grant(g.employeeId, next, g.id);
                      }}
                    />
                    <button
                      onClick={() => revoke(g)}
                      disabled={busy}
                      className="p-1.5 rounded-md text-[#bbb] hover:text-[#f31260] hover:bg-[#fef2f2] transition-colors shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                      title={`Remove ${name}'s access`}
                      aria-label={`Remove ${name}'s access`}
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-6 py-3 border-t border-[#f0f0f0] flex items-center justify-between gap-3">
          <p className="text-[11px] text-[#bbb]">Administrators already see every lead.</p>
          {error && <p className="text-[11px] text-[#f31260] truncate">{error}</p>}
        </div>
      </div>
    </div>
  );
}
