"use client";

import Link from "next/link";
import { ArrowRight, Megaphone, PhoneCall } from "lucide-react";
import { useCampaigns } from "@/lib/db/campaigns";

/**
 * The call sheets this person is on, and how far through each one is.
 *
 * campaigns_list is already scoped to the campaigns somebody holds, so a
 * caller sees theirs and an administrator sees all of them. "Continue
 * calling" goes straight to the sheet, which is where their day happens.
 */
export default function MyCampaigns() {
  const { campaigns, loading } = useCampaigns();
  const active = campaigns.filter((c) => c.status !== "done");

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && campaigns.length === 0 ? (
          <div className="px-5 py-4 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 bg-[#f7f7f7] rounded-lg animate-pulse" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="text-center py-10 px-5">
            <Megaphone className="w-5 h-5 text-[#ddd] mx-auto mb-2" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-0.5">No campaigns yet</p>
            <p className="text-xs text-[#999]">
              A call sheet shared with you shows up here, with how far through it you are.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#f7f7f7]">
            {active.map((c) => {
              const done = Math.min(c.calledCount, c.leadCount);
              const left = Math.max(0, c.leadCount - done);
              const pct = c.leadCount ? Math.round((done / c.leadCount) * 100) : 0;
              return (
                <Link
                  key={c.id}
                  href={`/leads/campaigns/${c.id}`}
                  className="block px-5 py-3.5 hover:bg-[#fafafa] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <p className="flex-1 min-w-0 text-[13px] font-medium text-[#0a0a0a] truncate">{c.name}</p>
                    <span className="text-[11px] tabular-nums text-[#999] shrink-0">
                      {done.toLocaleString()} / {c.leadCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex-1 h-1.5 rounded-full bg-[#f1f1f1] overflow-hidden">
                      <span
                        className="block h-full rounded-full bg-[#0a0a0a] transition-[width]"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="text-[10px] font-medium text-[#bbb] tabular-nums shrink-0 w-20 text-right">
                      {left.toLocaleString()} to call
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-[#f4f4f4] shrink-0">
        <Link
          href={active.length === 1 ? `/leads/campaigns/${active[0].id}` : "/leads/campaigns"}
          className="flex items-center gap-1 text-xs text-[#666] hover:text-[#0a0a0a] transition-colors font-medium"
        >
          {active.length === 1 ? (
            <>
              <PhoneCall className="w-3 h-3" /> Continue calling
            </>
          ) : (
            <>All campaigns</>
          )}
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
