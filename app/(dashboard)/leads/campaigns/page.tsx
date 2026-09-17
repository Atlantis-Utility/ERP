"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, Plus } from "lucide-react";
import Header from "@/components/layout/Header";
import LeadsTabs from "@/components/leads/LeadsTabs";
import CampaignsPanel from "@/components/campaigns/CampaignsPanel";
import CreateCampaignModal from "@/components/campaigns/CreateCampaignModal";
import ReviewChangesModal from "@/components/campaigns/ReviewChangesModal";
import { useCampaigns } from "@/lib/db/campaigns";
import { usePendingChangeCount } from "@/lib/db/lead-changes";
import { useLeadsAccess } from "@/lib/leads-access";

/**
 * The campaign list. A route of its own rather than a tab on /leads so that
 * a call sheet can return here, and because /leads/campaigns is already a
 * separate page grant (lib/nav-pages.ts) which AuthGuard enforces.
 */
export default function CampaignsPage() {
  const access = useLeadsAccess();
  const { campaigns, loading } = useCampaigns();
  // Across every campaign, not just one sheet: corrections arrive a few at a
  // time from whoever is calling, and the reviewer wants them in one place.
  const { count: pending, reload: reloadPending } = usePendingChangeCount();
  const [showReview, setShowReview] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState("");

  const actor = useMemo(
    () => (access.myEmployeeId ? { id: access.myEmployeeId, name: access.myName } : null),
    [access.myEmployeeId, access.myName],
  );

  return (
    <div>
      <Header
        title="Campaigns"
        subtitle={
          loading
            ? "Loading…"
            : `${campaigns.length.toLocaleString()} campaign${campaigns.length !== 1 ? "s" : ""}${
                access.isAdmin ? "" : " shared with you"
              }`
        }
        actions={
          pending === 0 ? undefined : access.isAdmin ? (
            <button
              onClick={() => setShowReview(true)}
              className="flex items-center gap-1.5 border border-[#f5a524] bg-[#fefce8] text-[13px] font-medium text-[#946c00] px-3 py-2 rounded-md hover:bg-[#fdf6d8] transition-colors"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              Review {pending.toLocaleString()} change{pending !== 1 ? "s" : ""}
            </button>
          ) : (
            // Not a button for an editor: it's the status of their own
            // corrections, and there's nothing for them to do about it.
            <span className="flex items-center gap-1.5 border border-[#f7e6a8] bg-[#fefce8] text-[13px] font-medium text-[#946c00] px-3 py-2 rounded-md">
              <ClipboardCheck className="w-3.5 h-3.5" />
              {pending.toLocaleString()} change{pending !== 1 ? "s" : ""} awaiting review
            </span>
          )
        }
      />

      {/* New campaign sits on the tab row rather than in a header of its own
          inside the list: the list had a second "Campaigns" heading directly
          under the page's, and the button had no obvious relationship to
          either. */}
      <LeadsTabs
        active="campaigns"
        canSeeCampaigns
        actions={
          access.isAdmin ? (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 bg-[#0a0a0a] text-white text-[13px] font-medium px-3 py-1.5 rounded-md hover:bg-[#333] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New campaign
            </button>
          ) : undefined
        }
      />

      {notice && (
        <p className="mb-4 px-4 py-2.5 rounded-lg bg-[#f0fdf4] text-[#17c964] text-sm">{notice}</p>
      )}

      <CampaignsPanel isAdmin={access.isAdmin} actor={actor} />

      {showCreate && access.isAdmin && (
        <CreateCampaignModal
          actor={actor}
          onClose={() => setShowCreate(false)}
          onCreated={(_id, message) => {
            // The list keeps itself current over realtime, so there's nothing
            // to refetch here.
            setNotice(message);
            setShowCreate(false);
          }}
        />
      )}
      {showReview && access.isAdmin && (
        <ReviewChangesModal
          onClose={() => {
            setShowReview(false);
            reloadPending();
          }}
          onReviewed={reloadPending}
        />
      )}
    </div>
  );
}
