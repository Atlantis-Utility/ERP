"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Check, Loader2, AlertCircle, ArrowRight, ClipboardCheck } from "lucide-react";
import {
  fetchPendingChanges,
  countPendingChanges,
  approveLeadChanges,
  rejectLeadChanges,
  changesError,
  LEAD_FIELD_LABELS,
  PENDING_PAGE_SIZE,
  type LeadChangeRequest,
} from "@/lib/db/lead-changes";

/**
 * An administrator's review of the corrections campaign editors have
 * proposed. Grouped by company, because that's the unit a reviewer thinks
 * in: "is this what that business is actually called now" is one decision,
 * even when it arrives as three separate fields.
 *
 * Approve/reject work on a selection, and the footer acts on everything
 * shown, so a hundred corrections from one afternoon of calling don't have
 * to be clicked through one at a time.
 */
export default function ReviewChangesModal({
  campaignId,
  campaignName,
  onClose,
  onReviewed,
}: {
  /** Omitted to review every campaign's queue. */
  campaignId?: string;
  campaignName?: string;
  onClose: () => void;
  /** Fired after anything is applied or turned down, so the sheet refetches. */
  onReviewed: (approved: number, rejected: number) => void;
}) {
  const [requests, setRequests] = useState<LeadChangeRequest[]>([]);
  // Everything pending, which is what the footer's "approve all" acts on.
  // The list itself is one page, so with a big queue the two differ and the
  // button must not claim to be approving only what's on screen.
  const [totalPending, setTotalPending] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState({ approved: 0, rejected: 0 });

  useEffect(() => {
    let cancelled = false;
    // `loading` starts true, so there's nothing to set here: the queue is
    // fetched once for the campaign this modal was opened for.
    Promise.all([fetchPendingChanges(campaignId), countPendingChanges(campaignId)])
      .then(([rows, total]) => {
        if (cancelled) return;
        setRequests(rows);
        setTotalPending(total);
        // Pre-selected: the reviewer is here to clear the queue, and
        // unticking the two they disagree with is less work than ticking the
        // ninety-eight they don't.
        setSelected(new Set(rows.map((r) => r.id)));
      })
      .catch((err) => {
        if (!cancelled) setError(changesError(err, "Couldn't load the pending changes"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const groups = useMemo(() => {
    const byLead = new Map<string, { company: string; campaign: string | null; items: LeadChangeRequest[] }>();
    for (const r of requests) {
      const key = r.leadId;
      const group = byLead.get(key) ?? {
        company: r.companyName ?? "(no company name)",
        campaign: r.campaignName,
        items: [],
      };
      group.items.push(r);
      byLead.set(key, group);
    }
    return [...byLead.values()];
  }, [requests]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(items: LeadChangeRequest[]) {
    const allOn = items.every((i) => selected.has(i.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const i of items) {
        if (allOn) next.delete(i.id);
        else next.add(i.id);
      }
      return next;
    });
  }

  async function run(action: "approve" | "reject", ids: string[] | null) {
    setBusy(true);
    setError("");
    try {
      const n =
        action === "approve" ? await approveLeadChanges(ids, campaignId) : await rejectLeadChanges(ids, campaignId);
      const tally = {
        approved: reviewed.approved + (action === "approve" ? n : 0),
        rejected: reviewed.rejected + (action === "reject" ? n : 0),
      };
      setReviewed(tally);
      onReviewed(tally.approved, tally.rejected);

      // Reload rather than filtering locally: approving one field of a lead
      // can leave others outstanding, and the queue is the source of truth
      // for what's left.
      const [rows, total] = await Promise.all([fetchPendingChanges(campaignId), countPendingChanges(campaignId)]);
      setRequests(rows);
      setTotalPending(total);
      setSelected(new Set(rows.map((r) => r.id)));
      if (rows.length === 0) onClose();
    } catch (err) {
      setError(changesError(err, `Failed to ${action} those changes`));
    } finally {
      setBusy(false);
    }
  }

  const selectedIds = [...selected];

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#eaeaea] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardCheck className="w-4 h-4 text-[#f5a524] shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#0a0a0a]">Review changes</p>
              <p className="text-[11px] text-[#999] truncate">
                {campaignName ? `From ${campaignName}` : "From every campaign"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#f5f5f5] transition-colors text-[#999]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-12 text-center">
              <Loader2 className="w-5 h-5 text-[#999] mx-auto mb-3 animate-spin" />
              <p className="text-sm text-[#999]">Loading the queue…</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-[#0a0a0a] mb-1">Nothing waiting</p>
              <p className="text-xs text-[#999]">
                Corrections made on a campaign sheet by someone with edit access show up here.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-[#666] mb-4 leading-relaxed">
                {requests.length.toLocaleString()} correction{requests.length !== 1 ? "s" : ""} across{" "}
                {groups.length.toLocaleString()} compan{groups.length !== 1 ? "ies" : "y"}. Approving writes the new
                value onto the lead and records it in that lead&apos;s history. Turning one down leaves the lead as it
                is.
                {totalPending > requests.length && (
                  <span className="text-[#946c00]">
                    {" "}
                    Showing the first {PENDING_PAGE_SIZE.toLocaleString()} of {totalPending.toLocaleString()}, review
                    these and the rest will load.
                  </span>
                )}
              </p>

              <div className="space-y-3">
                {groups.map((g) => {
                  const allOn = g.items.every((i) => selected.has(i.id));
                  return (
                    <div key={g.items[0].leadId} className="border border-[#eaeaea] rounded-lg overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 bg-[#fafafa] border-b border-[#eaeaea]">
                        <input
                          type="checkbox"
                          checked={allOn}
                          onChange={() => toggleGroup(g.items)}
                          className="w-3.5 h-3.5 accent-[#0a0a0a] cursor-pointer"
                          aria-label={`Select every change to ${g.company}`}
                        />
                        <p className="text-[13px] font-medium text-[#0a0a0a] truncate flex-1">{g.company}</p>
                        {g.campaign && <span className="text-[10px] text-[#999] shrink-0">{g.campaign}</span>}
                      </div>
                      <div className="divide-y divide-[#f7f7f7]">
                        {g.items.map((r) => (
                          <label
                            key={r.id}
                            className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-[#fafafa] transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              onChange={() => toggle(r.id)}
                              className="w-3.5 h-3.5 accent-[#0a0a0a] cursor-pointer mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-1">
                                {LEAD_FIELD_LABELS[r.field] ?? r.field}
                              </p>
                              {/* Before and after, side by side: the whole
                                  decision is whether the new value is better
                                  than the old one. */}
                              <div className="flex items-center gap-2 flex-wrap text-[12px]">
                                <span className="px-2 py-1 rounded-md bg-[#f5f5f5] text-[#666] line-through decoration-[#ccc]">
                                  {r.oldValue || "(empty)"}
                                </span>
                                <ArrowRight className="w-3 h-3 text-[#bbb] shrink-0" />
                                <span className="px-2 py-1 rounded-md bg-[#f0fdf4] text-[#0a0a0a] font-medium">
                                  {r.newValue || "(cleared)"}
                                </span>
                              </div>
                              <p className="text-[10px] text-[#bbb] mt-1.5">
                                {r.requestedByName ?? "Someone"} ·{" "}
                                {new Date(r.requestedAt).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {error && (
            <p className="text-xs text-[#f31260] mt-3 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </p>
          )}
        </div>

        {requests.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-t border-[#eaeaea] shrink-0">
            <button
              onClick={() => run("approve", null)}
              disabled={busy}
              className="text-xs font-medium text-[#666] px-2.5 py-1.5 rounded-md hover:bg-[#fafafa] transition-colors disabled:opacity-50"
              title="Approve every correction in this queue, including any not shown"
            >
              Approve all {Math.max(totalPending, requests.length).toLocaleString()}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => run("reject", selectedIds)}
                disabled={busy || selectedIds.length === 0}
                className="text-sm font-medium border border-[#eaeaea] bg-white text-[#f31260] px-3 py-1.5 rounded-lg hover:bg-[#fff0f3] transition-colors disabled:opacity-50"
              >
                Turn down {selectedIds.length > 0 ? selectedIds.length.toLocaleString() : ""}
              </button>
              <button
                onClick={() => run("approve", selectedIds)}
                disabled={busy || selectedIds.length === 0}
                className="flex items-center gap-2 text-sm font-medium bg-[#0a0a0a] text-white px-4 py-1.5 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Approve {selectedIds.length > 0 ? selectedIds.length.toLocaleString() : ""}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
