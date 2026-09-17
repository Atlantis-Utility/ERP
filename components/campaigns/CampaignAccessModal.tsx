"use client";

import { useState } from "react";
import { X, Loader2, Plus } from "lucide-react";
import Select from "@/components/ui/Select";
import LevelToggle from "@/components/leads/LevelToggle";
import { useEmployees } from "@/lib/db/employees";
import {
  useCampaignGrants,
  grantCampaignAccess,
  revokeCampaignGrant,
  type Campaign,
  type CampaignGrant,
} from "@/lib/db/campaigns";
import type { LeadGrantLevel } from "@/lib/db/lead-grants";
import { getAvatarColor, getInitials, getErrorMessage } from "@/lib/utils";

/**
 * Who works this campaign. An editor fills the sheet in; a viewer reads it.
 *
 * Being on a campaign also grants sight of the leads on its sheet and nothing
 * else (leads_campaign_lead_ids in supabase/migration-campaigns.sql), which
 * is the point: a rep can work a list without being handed ownership of every
 * company on it.
 */
export default function CampaignAccessModal({
  campaign,
  actor,
  onClose,
}: {
  campaign: Campaign;
  actor: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const employees = useEmployees();
  const grants = useCampaignGrants(campaign.id);
  const [employeeId, setEmployeeId] = useState("");
  const [level, setLevel] = useState<LeadGrantLevel>("editor");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const employeeFor = (id: string) => employees.find((e) => e.id === id);
  const granted = new Set(grants.map((g) => g.employeeId));
  const options = employees.filter((e) => !granted.has(e.id)).map((e) => ({ value: e.id, label: e.name }));

  async function grant(targetId: string, targetLevel: LeadGrantLevel, busyKey: string) {
    setBusyId(busyKey);
    setError("");
    try {
      await grantCampaignAccess(campaign.id, targetId, targetLevel, actor);
      if (busyKey === "new") {
        setEmployeeId("");
        setLevel("editor");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update access"));
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(g: CampaignGrant) {
    setBusyId(g.id);
    setError("");
    try {
      await revokeCampaignGrant(g.id);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to remove access"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#0a0a0a] tracking-tight truncate">{campaign.name}</h2>
            <p className="text-[13px] text-[#999] mt-0.5">
              Who can work this campaign. Editors fill the sheet in; viewers read it.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mt-1 -mr-1.5 rounded-md text-[#999] hover:text-[#0a0a0a] hover:bg-[#f5f5f5] transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

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
            <p className="text-[11px] text-[#bbb] mt-2">Everyone already has access to this campaign.</p>
          )}
        </div>

        <div className="border-t border-[#f0f0f0] overflow-y-auto flex-1">
          {grants.length === 0 ? (
            <p className="px-6 py-8 text-[13px] text-[#999] text-center">
              Nobody has been added yet. Only administrators can see this campaign.
            </p>
          ) : (
            <ul className="divide-y divide-[#f4f4f4]">
              {grants.map((g) => {
                const employee = employeeFor(g.employeeId);
                const name = employee?.name ?? "Unknown teammate";
                const colors = getAvatarColor(name);
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
                      <p className="text-[11px] text-[#999] truncate">{employee?.role ?? employee?.email ?? ""}</p>
                    </div>
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
                      title={`Remove ${name}`}
                      aria-label={`Remove ${name}`}
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
          <p className="text-[11px] text-[#bbb]">Being on a campaign also shows its leads, and nothing outside it.</p>
          {error && <p className="text-[11px] text-[#f31260] truncate">{error}</p>}
        </div>
      </div>
    </div>
  );
}
