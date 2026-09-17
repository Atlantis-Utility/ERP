"use client";

import { useState } from "react";
import { Building2, AlertTriangle, Lock, GripVertical, ArrowRight } from "lucide-react";
import {
  SETTABLE_STATUS_OPTIONS,
  STATUS_ICONS,
  STATUS_STYLES,
  PRIORITY_STYLES,
  isFollowUpOverdue,
} from "@/lib/leads-constants";
import type { Lead, LeadStatus, StageCount } from "@/lib/db/leads";
import { getAvatarColor, getInitials } from "@/lib/utils";

/**
 * Stage board: one column per stage. Dragging a card moves its stage, only
 * for leads the user can actually edit, so a read-only viewer gets a board
 * they can read and not rearrange.
 *
 * Each column shows a *window* onto its stage, not the whole thing: a stage
 * can hold thousands of leads, and mounting thousands of cards would lock up
 * the tab. The header carries the true count (counted in SQL), and "View all"
 * hands the stage off to the table view, which pages.
 */
export default function LeadStageBoard({
  columns,
  counts,
  canEditLead,
  onOpen,
  onMove,
  onFocusStage,
}: {
  /** The loaded window of cards per stage, not the whole stage. */
  columns: Record<string, Lead[]>;
  /** True per-stage totals from SQL, which is what the headers show. */
  counts: Record<string, StageCount>;
  canEditLead: (lead: Lead) => boolean;
  onOpen: (leadId: string) => void;
  onMove: (lead: Lead, status: LeadStatus) => void;
  onFocusStage: (status: LeadStatus) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<LeadStatus | null>(null);

  const loadedLeads = Object.values(columns).flat();
  const dragging = draggingId ? (loadedLeads.find((l) => l.id === draggingId) ?? null) : null;

  function handleDrop(stage: LeadStatus) {
    setDragOverStage(null);
    const lead = dragging;
    setDraggingId(null);
    if (!lead || lead.status === stage) return;
    // Re-checked on drop, not just on dragstart: the lead could have been
    // reassigned out from under this user mid-drag by a live update.
    if (!canEditLead(lead)) return;
    onMove(lead, stage);
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-start gap-3 min-w-max">
        {SETTABLE_STATUS_OPTIONS.map((stage) => {
          const stageLeads = columns[stage.value] ?? [];
          const count = counts[stage.value]?.n ?? 0;
          const hidden = Math.max(0, count - stageLeads.length);
          const isTarget = dragOverStage === stage.value;

          return (
            <div
              key={stage.value}
              onDragOver={(e) => {
                if (!dragging || !canEditLead(dragging)) return;
                e.preventDefault();
                setDragOverStage(stage.value);
              }}
              onDragLeave={() => setDragOverStage((s) => (s === stage.value ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(stage.value);
              }}
              className={`w-72 shrink-0 rounded-xl border transition-colors ${
                isTarget ? "border-[#0070f3] bg-[#eff6ff]" : "border-[#eaeaea] bg-[#fafafa]"
              }`}
            >
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#eaeaea]">
                {/* The icon carries the stage's own accent on a tint of it,
                    so a column is identifiable before the label is read. */}
                {(() => {
                  const Icon = STATUS_ICONS[stage.value];
                  if (!Icon) return null;
                  return (
                    <span
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${STATUS_STYLES[stage.value]}`}
                    >
                      <Icon className="w-3 h-3" />
                    </span>
                  );
                })()}
                <p className="text-xs font-semibold text-[#0a0a0a] flex-1 truncate">{stage.label}</p>
                <span className="text-[10px] text-[#999] tabular-nums shrink-0">{count.toLocaleString()}</span>
              </div>

              <div className="p-2 space-y-2 min-h-24 max-h-128 overflow-y-auto">
                {count === 0 && <p className="text-[11px] text-[#ccc] text-center py-6">No leads</p>}

                {stageLeads.map((lead) => {
                  const editable = canEditLead(lead);
                  const overdue = isFollowUpOverdue(lead.followUpDate, lead.status);
                  const owner = lead.assignedToName;
                  const colors = owner ? getAvatarColor(owner) : null;

                  return (
                    <div
                      key={lead.id}
                      draggable={editable}
                      onDragStart={() => setDraggingId(lead.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverStage(null);
                      }}
                      className={`bg-white border rounded-lg p-2.5 transition-colors ${
                        draggingId === lead.id
                          ? "border-[#0070f3] opacity-60"
                          : "border-[#eaeaea] hover:border-[#d4d4d4]"
                      } ${editable ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        {editable ? (
                          <GripVertical className="w-3 h-3 text-[#ccc] shrink-0 mt-0.5" /> // Tooltip lives on a wrapper: an SVG `title`
                        ) : (
                          // attribute doesn't produce one, only a <title>
                          // child element would.
                          <span title="Read-only, you can view this lead but not change it" className="shrink-0 mt-0.5">
                            <Lock className="w-3 h-3 text-[#ccc]" />
                          </span>
                        )}
                        <button onClick={() => onOpen(lead.id)} className="min-w-0 flex-1 text-left">
                          <p className="text-xs font-medium text-[#0a0a0a] truncate hover:text-[#0070f3] transition-colors">
                            {lead.companyName}
                          </p>
                          {(lead.pocName || lead.businessType) && (
                            <p className="text-[10px] text-[#999] truncate mt-0.5">
                              {lead.pocName || lead.businessType}
                            </p>
                          )}
                        </button>
                      </div>

                      <div className="flex items-center flex-wrap gap-1.5 mt-2">
                        {lead.priority && (
                          <span
                            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_STYLES[lead.priority]}`}
                          >
                            {lead.priority.toUpperCase()}
                          </span>
                        )}
                        {overdue && (
                          <span className="flex items-center gap-0.5 text-[9px] font-semibold text-[#f31260]">
                            <AlertTriangle className="w-2.5 h-2.5" /> OVERDUE
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[#f5f5f5]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {owner && colors ? (
                            <>
                              <div
                                className={`w-4 h-4 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center shrink-0`}
                              >
                                <span className="text-[7px] font-semibold">{getInitials(owner)}</span>
                              </div>
                              <span className="text-[10px] text-[#999] truncate">{owner}</span>
                            </>
                          ) : (
                            <span className="text-[10px] text-[#ccc]">Unassigned</span>
                          )}
                        </div>
                        <Building2 className="w-3 h-3 text-[#e5e5e5] shrink-0" />
                      </div>
                    </div>
                  );
                })}

                {/* Says plainly that the column is a window, rather than
                    letting it look like the stage only holds `perColumn`. */}
                {hidden > 0 && (
                  <button
                    onClick={() => onFocusStage(stage.value)}
                    className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium text-[#0070f3] hover:bg-[#eff6ff] py-2 rounded-lg transition-colors"
                  >
                    View all {count.toLocaleString()}
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
