"use client";

import { useState } from "react";
import Overlay from "@/components/ui/Overlay";
import { X, Loader2 } from "lucide-react";
import Select from "@/components/ui/Select";
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
import { useToast } from "@/lib/toast";

/**
 * Who works this campaign. An editor fills the sheet in; a viewer reads it.
 *
 * Being on a campaign also grants sight of the leads on its sheet and nothing
 * else (leads_campaign_lead_ids in supabase/migration-campaigns.sql), which
 * is the point: a rep can work a list without being handed ownership of every
 * company on it.
 */
const LEVEL_OPTIONS = [
  { value: "viewer", label: "Read-only" },
  { value: "editor", label: "Can edit" },
];

/** Not a level: picked from the same menu, handled as an action. */
const REVOKE_OPTION = "__revoke";

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
  const { error: toastError } = useToast();

  const employeeFor = (id: string) => employees.find((e) => e.id === id);
  const granted = new Set(grants.map((g) => g.employeeId));
  const options = employees.filter((e) => !granted.has(e.id)).map((e) => ({ value: e.id, label: e.name }));

  async function grant(targetId: string, targetLevel: LeadGrantLevel, busyKey: string) {
    setBusyId(busyKey);
    try {
      await grantCampaignAccess(campaign.id, targetId, targetLevel, actor);
      if (busyKey === "new") {
        setEmployeeId("");
        setLevel("editor");
      }
    } catch (err) {
      toastError(getErrorMessage(err, "Failed to update access"));
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(g: CampaignGrant) {
    setBusyId(g.id);
    try {
      await revokeCampaignGrant(g.id);
    } catch (err) {
      toastError(getErrorMessage(err, "Failed to remove access"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Overlay onDismiss={onClose} className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[#0a0a0a] tracking-tight truncate">Share {campaign.name}</h2>
            <p className="text-[12px] text-[#999] mt-1">Editors fill the sheet in. Viewers read it.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mt-1 -mr-1.5 rounded-md text-[#bbb] hover:text-[#0a0a0a] hover:bg-[#f5f5f5] transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* One row, one job: who, at what level, and go. */}
        <div className="px-5 pb-5">
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
            <div className="w-32 shrink-0">
              <Select value={level} onChange={(v) => setLevel(v as LeadGrantLevel)} options={LEVEL_OPTIONS} />
            </div>
            <button
              onClick={() => employeeId && grant(employeeId, level, "new")}
              disabled={!employeeId || busyId === "new"}
              className="flex items-center justify-center text-[13px] font-medium bg-[#0a0a0a] text-white w-16 py-2 rounded-md hover:bg-[#333] transition-colors disabled:opacity-40 shrink-0"
            >
              {busyId === "new" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
            </button>
          </div>
          {options.length === 0 && employees.length > 0 && (
            <p className="text-[11px] text-[#bbb] mt-2">Everyone already has access to this campaign.</p>
          )}
        </div>

        <div className="border-t border-[#f0f0f0] overflow-y-auto flex-1">
          {grants.length === 0 ? (
            <p className="px-5 py-10 text-[13px] text-[#999] text-center">
              Nobody has been added yet.
              <span className="block text-[11px] text-[#bbb] mt-1">
                Only administrators can see this campaign until you do.
              </span>
            </p>
          ) : (
            <ul className="divide-y divide-[#f4f4f4]">
              {grants.map((g) => {
                const employee = employeeFor(g.employeeId);
                const name = employee?.name ?? "Unknown teammate";
                const colors = getAvatarColor(name);
                const busy = busyId === g.id;
                return (
                  <li key={g.id} className="flex items-center gap-3 px-5 py-3">
                    <div
                      className={`w-7 h-7 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center shrink-0`}
                    >
                      <span className="text-[10px] font-semibold">{getInitials(name)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-[#0a0a0a] truncate">{name}</p>
                      <p className="text-[11px] text-[#999] truncate">{employee?.role ?? employee?.email ?? ""}</p>
                    </div>
                    {/* The level and removing it are the same decision, so
                        they're the same control, rather than a segmented
                        toggle plus an X that only appears on hover. */}
                    <div className="w-36 shrink-0">
                      <Select
                        value={g.level}
                        disabled={busy}
                        onChange={(next) => {
                          if (next === REVOKE_OPTION) revoke(g);
                          else if (next !== g.level) grant(g.employeeId, next as LeadGrantLevel, g.id);
                        }}
                        options={[...LEVEL_OPTIONS, { value: REVOKE_OPTION, label: "Remove access", danger: true }]}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#f0f0f0]">
          <p className="text-[11px] text-[#bbb]">
            Being on a campaign also shows its leads on the Leads page, and nothing outside it.
          </p>
        </div>
      </div>
    </Overlay>
  );
}
