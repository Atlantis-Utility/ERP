"use client";

import { useState } from "react";
import Link from "next/link";
import { Megaphone, Plus, Loader2, Users, Trash2, ChevronRight, Eye, Pencil } from "lucide-react";
import CreateCampaignModal from "@/components/campaigns/CreateCampaignModal";
import CampaignAccessModal from "@/components/campaigns/CampaignAccessModal";
import { useCampaigns, deleteCampaign, updateCampaign, type Campaign, type CampaignStatus } from "@/lib/db/campaigns";
import { CAMPAIGN_STATUS_OPTIONS, CAMPAIGN_STATUS_STYLES, calledPercent } from "@/lib/campaign-constants";
import Select from "@/components/ui/Select";
import { getErrorMessage } from "@/lib/utils";

/**
 * The Campaigns tab: every campaign the user can see, with progress, and the
 * controls an administrator needs (access, status, delete). Opening one goes
 * to its call sheet.
 */
export default function CampaignsPanel({
  isAdmin,
  actor,
}: {
  isAdmin: boolean;
  actor: { id: string; name: string } | null;
}) {
  const { campaigns, loading, error: loadError } = useCampaigns();
  const [showCreate, setShowCreate] = useState(false);
  const [accessFor, setAccessFor] = useState<Campaign | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function setStatus(campaign: Campaign, status: CampaignStatus) {
    setBusyId(campaign.id);
    setError("");
    try {
      await updateCampaign(campaign.id, { status });
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update the campaign"));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(campaign: Campaign) {
    if (
      !confirm(
        `Delete "${campaign.name}"? Its ${campaign.leadCount.toLocaleString()} row${campaign.leadCount !== 1 ? "s" : ""} and all call notes on them are removed. The leads themselves stay.`,
      )
    ) {
      return;
    }
    setBusyId(campaign.id);
    setError("");
    try {
      await deleteCampaign(campaign.id);
      setNotice(`Deleted "${campaign.name}".`);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete the campaign"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="bg-white border border-[#eaeaea] rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
        <div>
          <p className="text-sm font-semibold text-[#0a0a0a]">Campaigns</p>
          <p className="text-[11px] text-[#999] mt-0.5">
            {loading ? "Loading…" : `${campaigns.length} campaign${campaigns.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-[#0a0a0a] text-white text-[13px] font-medium px-3.5 py-2 rounded-md hover:bg-[#333] transition-colors"
          >
            <Plus className="w-4 h-4" />
            New campaign
          </button>
        )}
      </div>

      {(error || loadError) && (
        <p className="px-5 py-3 text-[13px] text-[#f31260] border-b border-[#f0f0f0]">{error || loadError}</p>
      )}
      {notice && <p className="px-5 py-3 text-[13px] text-[#17c964] border-b border-[#f0f0f0]">{notice}</p>}

      {loading && (
        <div className="p-12 text-center">
          <Loader2 className="w-5 h-5 text-[#999] mx-auto mb-3 animate-spin" />
          <p className="text-sm text-[#999]">Loading campaigns…</p>
        </div>
      )}

      {!loading && campaigns.length === 0 && (
        <div className="p-12 text-center">
          <Megaphone className="w-6 h-6 text-[#999] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#0a0a0a] mb-1">No campaigns yet</p>
          <p className="text-xs text-[#999]">
            {isAdmin
              ? "Create one to work a slice of the leads as a call sheet."
              : "You'll see campaigns here once an administrator adds you to one."}
          </p>
        </div>
      )}

      {!loading && campaigns.length > 0 && (
        <ul className="divide-y divide-[#f4f4f4]">
          {campaigns.map((c) => {
            const percent = calledPercent(c.calledCount, c.leadCount);
            const busy = busyId === c.id;
            return (
              <li key={c.id} className="group flex items-center gap-4 px-5 py-4 hover:bg-[#fafafa] transition-colors">
                <Link href={`/leads/campaigns/${c.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#0a0a0a] truncate group-hover:text-[#0070f3] transition-colors">
                      {c.name}
                    </p>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${CAMPAIGN_STATUS_STYLES[c.status]}`}
                    >
                      {c.status.toUpperCase()}
                    </span>
                    {/* A viewer should know before they open it that they
                        can't fill anything in. */}
                    {c.myLevel === "viewer" && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[#999] shrink-0">
                        <Eye className="w-2.5 h-2.5" /> READ-ONLY
                      </span>
                    )}
                    {c.myLevel === "editor" && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[#999] shrink-0">
                        <Pencil className="w-2.5 h-2.5" /> CAN EDIT
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#999] mt-1 truncate">
                    {[
                      `${c.leadCount.toLocaleString()} lead${c.leadCount !== 1 ? "s" : ""}`,
                      c.leadCount > 0 && `${c.calledCount.toLocaleString()} called (${percent}%)`,
                      c.description,
                      c.createdByName && `by ${c.createdByName}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {/* Progress as a hairline rather than a chart: it's a
                      glance, not a report. */}
                  {c.leadCount > 0 && (
                    <div className="h-0.5 bg-[#f0f0f0] rounded-full mt-2 max-w-64 overflow-hidden">
                      <div
                        className="h-full bg-[#0a0a0a] rounded-full transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  )}
                </Link>

                {isAdmin && (
                  <>
                    <div className="w-28 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Select
                        value={c.status}
                        onChange={(v) => setStatus(c, v as CampaignStatus)}
                        options={CAMPAIGN_STATUS_OPTIONS}
                        disabled={busy}
                      />
                    </div>
                    <button
                      onClick={() => setAccessFor(c)}
                      className="flex items-center gap-1.5 text-xs font-medium text-[#666] hover:text-[#0a0a0a] px-2 py-1.5 rounded-md hover:bg-[#f5f5f5] transition-colors shrink-0"
                      title="Manage who works this campaign"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Access</span>
                    </button>
                    <button
                      onClick={() => remove(c)}
                      disabled={busy}
                      className="p-1.5 rounded-md text-[#bbb] hover:text-[#f31260] hover:bg-[#fef2f2] transition-colors shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                      title={`Delete ${c.name}`}
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </>
                )}
                <Link
                  href={`/leads/campaigns/${c.id}`}
                  className="p-1.5 rounded-md text-[#ccc] hover:text-[#0a0a0a] hover:bg-[#f5f5f5] transition-colors shrink-0"
                  aria-label={`Open ${c.name}`}
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {showCreate && isAdmin && (
        <CreateCampaignModal
          actor={actor}
          onClose={() => setShowCreate(false)}
          onCreated={(_id, message) => {
            setNotice(message);
            setShowCreate(false);
          }}
        />
      )}
      {accessFor && <CampaignAccessModal campaign={accessFor} actor={actor} onClose={() => setAccessFor(null)} />}
    </div>
  );
}
