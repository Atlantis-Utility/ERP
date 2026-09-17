"use client";

import { useState } from "react";
import { Plus, Loader2, X } from "lucide-react";
import Select from "@/components/ui/Select";
import LevelToggle from "@/components/leads/LevelToggle";
import { useEmployees } from "@/lib/db/employees";
import {
  useLeadGrantsFor,
  useGlobalLeadGrants,
  grantLeadAccess,
  revokeLeadGrant,
  type LeadGrant,
  type LeadGrantLevel,
} from "@/lib/db/lead-grants";
import type { ActivityActor } from "@/lib/db/lead-activity";
import type { Lead } from "@/lib/db/leads";
import { getAvatarColor, getInitials, getErrorMessage } from "@/lib/utils";

const LEVEL_LABEL: Record<LeadGrantLevel, string> = {
  viewer: "Read-only",
  editor: "Can edit",
};

/**
 * Who can see this one lead: its owner, anyone it's been shared with, and
 * anyone holding access to all leads. Administrators can share and revoke
 * here; everyone else gets the same list read-only, so an owner can at least
 * tell who else is looking at their lead.
 */
export default function LeadAccessPanel({
  lead,
  actor,
  canGrant,
}: {
  lead: Lead;
  actor: ActivityActor | null;
  canGrant: boolean;
}) {
  const employees = useEmployees();
  // Scoped to this lead, plus the (tiny) set of all-leads grants. Loading
  // every grant would mean one row per shared lead, and a filter-wide share
  // can create thousands.
  const leadGrants = useLeadGrantsFor(lead.id);
  const globalGrants = useGlobalLeadGrants();
  const [adding, setAdding] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [level, setLevel] = useState<LeadGrantLevel>("viewer");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const employeeFor = (id: string) => employees.find((e) => e.id === id);
  const nameFor = (id: string) => employeeFor(id)?.name ?? "Unknown teammate";

  // Already-covered people shouldn't be offered again: the owner has full
  // access by definition, and re-granting the same person replaces their row,
  // which reads like a bug from the outside.
  const takenIds = new Set([...(lead.assignedTo ? [lead.assignedTo] : []), ...leadGrants.map((g) => g.employeeId)]);
  const options = employees.filter((e) => !takenIds.has(e.id)).map((e) => ({ value: e.id, label: e.name }));

  async function grant(targetId: string, targetLevel: LeadGrantLevel, busyKey: string) {
    setBusyId(busyKey);
    setError("");
    try {
      await grantLeadAccess({ leadId: lead.id, employeeId: targetId, level: targetLevel }, actor);
      if (busyKey === "new") {
        setEmployeeId("");
        setLevel("viewer");
        setAdding(false);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to share this lead"));
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

  const ownerName = lead.assignedToName ?? (lead.assignedTo ? nameFor(lead.assignedTo) : null);
  const ownerColors = ownerName ? getAvatarColor(ownerName) : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <p className="text-sm font-semibold text-[#0a0a0a]">Access</p>
        {canGrant && !adding && options.length > 0 && (
          <button
            onClick={() => {
              setAdding(true);
              setError("");
            }}
            className="flex items-center gap-1 text-xs font-medium text-[#666] hover:text-[#0a0a0a] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Share
          </button>
        )}
      </div>

      {/* One bordered container with dividers, rather than a border per row, the same card treatment the app's tables use. */}
      <div className="border border-[#eaeaea] rounded-lg divide-y divide-[#f4f4f4] overflow-hidden">
        {/* Owner */}
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          {ownerName && ownerColors ? (
            <>
              <div
                className={`w-7 h-7 rounded-full ${ownerColors.bg} ${ownerColors.text} flex items-center justify-center shrink-0`}
              >
                <span className="text-[10px] font-semibold">{getInitials(ownerName)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[#0a0a0a] truncate">{ownerName}</p>
                <p className="text-[11px] text-[#999] truncate">
                  {employeeFor(lead.assignedTo ?? "")?.role ?? "Assigned owner"}
                </p>
              </div>
              <span className="text-[11px] text-[#999] shrink-0">Owner</span>
            </>
          ) : (
            <>
              <div className="w-7 h-7 rounded-full bg-[#f5f5f5] flex items-center justify-center shrink-0">
                <span className="text-[10px] font-semibold text-[#bbb]">-</span>
              </div>
              <p className="text-[13px] text-[#999] flex-1 truncate">Unassigned</p>
              <span className="text-[11px] text-[#bbb] shrink-0">Administrators only</span>
            </>
          )}
        </div>

        {/* Shared with */}
        {leadGrants.map((g) => {
          const name = nameFor(g.employeeId);
          const colors = getAvatarColor(name);
          const busy = busyId === g.id;
          return (
            <div
              key={g.id}
              className="group flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#fafafa] transition-colors"
            >
              <div
                className={`w-7 h-7 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center shrink-0`}
              >
                <span className="text-[10px] font-semibold">{getInitials(name)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[#0a0a0a] truncate">{name}</p>
                <p className="text-[11px] text-[#999] truncate">
                  {employeeFor(g.employeeId)?.role ?? LEVEL_LABEL[g.level]}
                </p>
              </div>
              {canGrant ? (
                <>
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
                    className="p-1 rounded-md text-[#bbb] hover:text-[#f31260] hover:bg-[#fef2f2] transition-colors shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                    title={`Remove ${name}'s access`}
                    aria-label={`Remove ${name}'s access`}
                  >
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                  </button>
                </>
              ) : (
                <span className="text-[11px] text-[#999] shrink-0">{LEVEL_LABEL[g.level]}</span>
              )}
            </div>
          );
        })}

        {/* Add row, inline in the list so the layout doesn't jump. */}
        {adding && (
          <div className="px-3 py-2.5 bg-[#fafafa]">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Select
                  value={employeeId}
                  onChange={setEmployeeId}
                  placeholder="Pick a teammate…"
                  options={options}
                  searchable
                />
              </div>
              <LevelToggle value={level} onChange={setLevel} />
            </div>
            <div className="flex items-center justify-end gap-1 mt-2">
              <button
                onClick={() => {
                  setAdding(false);
                  setEmployeeId("");
                  setError("");
                }}
                className="text-xs text-[#999] hover:text-[#0a0a0a] px-2 py-1 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => employeeId && grant(employeeId, level, "new")}
                disabled={!employeeId || busyId === "new"}
                className="flex items-center gap-1.5 text-xs font-medium bg-[#0a0a0a] text-white px-3 py-1.5 rounded-md hover:bg-[#333] transition-colors disabled:opacity-40"
              >
                {busyId === "new" && <Loader2 className="w-3 h-3 animate-spin" />}
                Share
              </button>
            </div>
          </div>
        )}
      </div>

      {/* All-leads grants are listed for context, not revocable from here, they aren't this lead's to revoke, that lives in Lead access. */}
      {globalGrants.length > 0 && (
        <p className="text-[11px] text-[#bbb] mt-2 leading-relaxed">
          Also visible to{" "}
          {globalGrants.map((g, i) => (
            <span key={g.id}>
              {i > 0 && (i === globalGrants.length - 1 ? " and " : ", ")}
              <span className="text-[#999]">{nameFor(g.employeeId)}</span>
            </span>
          ))}
          , who {globalGrants.length === 1 ? "has" : "have"} access to all leads.
        </p>
      )}

      {error && <p className="text-xs text-[#f31260] mt-2">{error}</p>}
    </div>
  );
}
