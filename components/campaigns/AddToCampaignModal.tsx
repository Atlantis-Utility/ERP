"use client";

import { useState } from "react";
import Overlay from "@/components/ui/Overlay";
import { X, Loader2, Megaphone } from "lucide-react";
import Select from "@/components/ui/Select";
import { useCampaigns, addLeadsToCampaign, type CampaignFill } from "@/lib/db/campaigns";
import { getErrorMessage } from "@/lib/utils";

/**
 * Drops the leads selected on the Leads table into an existing campaign.
 *
 * Takes the same "ids or criteria" target the bulk bar uses, so "add all
 * 9,000 matching" goes in as one statement rather than shipping 9,000 ids.
 */
export default function AddToCampaignModal({
  fill,
  count,
  onClose,
  onDone,
}: {
  fill: CampaignFill;
  count: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { campaigns, loading, error: listError } = useCampaigns();
  const [campaignId, setCampaignId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Only campaigns the user can actually add rows to.
  const writable = campaigns.filter((c) => c.myLevel === "admin" || c.myLevel === "editor");
  const selected = writable.find((c) => c.id === campaignId);

  async function submit() {
    if (!campaignId) {
      setError("Pick a campaign.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const added = await addLeadsToCampaign(campaignId, fill);
      const name = selected?.name ?? "the campaign";
      onDone(
        added === 0
          ? `Nothing added. Those leads are already on ${name}.`
          : `Added ${added.toLocaleString()} lead${added !== 1 ? "s" : ""} to ${name}.`,
      );
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to add to the campaign"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onDismiss={onClose} className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      dismissable={!saving}>
      <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-md flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#0a0a0a] tracking-tight">Add to campaign</h2>
            <p className="text-[13px] text-[#999] mt-0.5">
              {count.toLocaleString()} lead{count !== 1 ? "s" : ""} selected
              {fill.kind === "criteria" && " (everything matching your filters)"}
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

        <div className="px-6 pb-5 space-y-3">
          {loading ? (
            <p className="flex items-center gap-2 text-[13px] text-[#999] py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading campaigns…
            </p>
          ) : writable.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Megaphone className="w-5 h-5 text-[#ccc] mx-auto mb-2" />
              <p className="text-[13px] text-[#999]">
                {listError || "No campaigns you can add to yet. Create one from the Campaigns tab."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-[#666]">Campaign</label>
                <Select
                  value={campaignId}
                  onChange={setCampaignId}
                  placeholder="Pick a campaign"
                  options={writable.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${c.leadCount.toLocaleString()})`,
                  }))}
                  searchable
                />
              </div>
              <p className="text-[11px] text-[#bbb]">
                Leads already on that sheet are skipped, so adding twice is safe.
              </p>
            </>
          )}
          {error && <p className="text-[12px] text-[#f31260]">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#f0f0f0]">
          <button
            onClick={onClose}
            className="text-[13px] font-medium border border-[#eaeaea] bg-white text-[#444] px-3.5 py-2 rounded-md hover:bg-[#fafafa] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !campaignId}
            className="flex items-center gap-1.5 text-[13px] font-medium bg-[#0a0a0a] text-white px-4 py-2 rounded-md hover:bg-[#333] transition-colors disabled:opacity-40"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Add
          </button>
        </div>
      </div>
    </Overlay>
  );
}
