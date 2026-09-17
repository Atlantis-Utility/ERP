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
import { useIsOwner } from "@/lib/db/ownership";

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
  const isOwner = useIsOwner();
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
              <li
                key={c.id}
                className="group relative flex items-center gap-3 px-5 py-4 transition-colors hover:bg-[#fafafa]"
              >
                {/* The row is the target, so the whole of it is clickable
                    rather than just the title. The link sits underneath as a
                    full-bleed overlay and the text above it ignores pointer
                    events, which leaves the controls on the right clickable
                    without nesting anything inside a link. */}
                <Link href={`/leads/campaigns/${c.id}`} className="absolute inset-0" aria-label={`Open ${c.name}`} />

                <div className="relative min-w-0 flex-1 pointer-events-none">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-[#0a0a0a] truncate">{c.name}</p>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${CAMPAIGN_STATUS_STYLES[c.status]}`}
                    >
                      {c.status}
                    </span>
                    {/* Worth knowing before opening it that you can't fill
                        anything in. Only shown when it isn't obvious: an
                        administrator's own level says nothing useful. */}
                    {c.myLevel === "viewer" && (
                      <span className="flex items-center gap-1 text-[10px] text-[#999] shrink-0">
                        <Eye className="w-2.5 h-2.5" /> read-only
                      </span>
                    )}
                    {c.myLevel === "editor" && (
                      <span className="flex items-center gap-1 text-[10px] text-[#999] shrink-0">
                        <Pencil className="w-2.5 h-2.5" /> can edit
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1.5">
                    <p className="text-[11px] text-[#999] tabular-nums shrink-0">
                      {c.leadCount.toLocaleString()} lead{c.leadCount !== 1 ? "s" : ""}
                    </p>
                    {c.leadCount > 0 && (
                      <>
                        <span className="text-[#e5e5e5]">·</span>
                        {/* Progress reads as one thing: the bar and the number
                            together, rather than a bar on its own line. */}
                        <div className="h-1 w-24 bg-[#f0f0f0] rounded-full overflow-hidden shrink-0">
                          <div
                            className="h-full bg-[#0a0a0a] rounded-full transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-[#999] tabular-nums shrink-0">
                          {c.calledCount.toLocaleString()} called
                        </p>
                      </>
                    )}
                    {c.createdByName && (
                      <>
                        <span className="text-[#e5e5e5]">·</span>
                        <p className="text-[11px] text-[#bbb] truncate">{c.createdByName}</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Muted until the row is hovered, rather than appearing from
                    nothing: the row keeps its shape and the controls are
                    still discoverable. */}
                <div className="relative flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                  {isAdmin && (
                    <>
                      <div className="w-24">
                        <Select
                          value={c.status}
                          onChange={(v) => setStatus(c, v as CampaignStatus)}
                          options={CAMPAIGN_STATUS_OPTIONS}
                          disabled={busy}
                        />
                      </div>
                      <button
                        onClick={() => setAccessFor(c)}
                        className="flex items-center gap-1.5 text-xs font-medium text-[#666] hover:text-[#0a0a0a] px-2.5 py-2 rounded-md hover:bg-[#f0f0f0] transition-colors"
                        title="Manage who works this campaign"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Access</span>
                      </button>
                    </>
                  )}
                  {/* Deleting a campaign takes its whole sheet with it, so it
                      is the owner's to do, not every administrator's. The
                      policy in SQL is what actually decides; this only keeps
                      the button from being offered to someone it would
                      refuse. */}
                  {isOwner && (
                    <button
                      onClick={() => remove(c)}
                      disabled={busy}
                      className="p-2 rounded-md text-[#bbb] hover:text-[#f31260] hover:bg-[#fef2f2] transition-colors disabled:opacity-50"
                      title={`Delete ${c.name}`}
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <ChevronRight className="w-4 h-4 text-[#ddd] group-hover:text-[#999] transition-colors" />
                </div>
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
