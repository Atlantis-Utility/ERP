"use client";

import { History, ArrowRight, UserCheck, Pencil, Phone, Shield, Plus, Download, Loader2 } from "lucide-react";
import { useLeadActivity, type LeadActivityKind } from "@/lib/db/lead-activity";
import { getAvatarColor, getInitials } from "@/lib/utils";

const KIND_ICON: Record<LeadActivityKind, typeof Pencil> = {
  created: Plus,
  stage: ArrowRight,
  assigned: UserCheck,
  field: Pencil,
  note: Phone,
  grant: Shield,
  import: Download,
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * The lead's history, every stage move, reassignment and field edit, newest
 * first. Read-only by design: lead_activity has no update policy, so this is
 * a record rather than something to curate.
 */
export default function LeadActivityFeed({ leadId }: { leadId: string }) {
  const { activity, loading, error } = useLeadActivity(leadId);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-[#999]" />
        <p className="text-sm font-semibold text-[#0a0a0a]">Activity</p>
        {!loading && activity.length > 0 && <span className="text-xs text-[#999]">({activity.length})</span>}
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-xs text-[#999]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading history…
        </p>
      )}

      {error && <p className="text-xs text-[#f31260]">{error}</p>}

      {!loading && !error && activity.length === 0 && (
        <p className="text-xs text-[#999]">Nothing recorded yet. Stage moves, reassignments and edits show up here.</p>
      )}

      {activity.length > 0 && (
        <div className="space-y-2.5">
          {activity.map((a) => {
            const Icon = KIND_ICON[a.kind] ?? Pencil;
            const actor = a.actorName ?? "System";
            const colors = getAvatarColor(actor);
            return (
              <div key={a.id} className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-[#f5f5f5] flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-3 h-3 text-[#666]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[#333] leading-relaxed break-words">{a.summary}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div
                      className={`w-3.5 h-3.5 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center shrink-0`}
                    >
                      <span className="text-[6px] font-semibold">{getInitials(actor)}</span>
                    </div>
                    <span className="text-[10px] text-[#bbb]">
                      {actor} · {formatWhen(a.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
