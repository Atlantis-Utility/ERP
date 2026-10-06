"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, PhoneOutgoing } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { subscribeChanges } from "@/lib/supabase/realtime";
import { CALL_OUTCOME_OPTIONS, CALL_OUTCOME_STYLES } from "@/lib/campaign-constants";

/**
 * What this person got through today, from the sheet rows they touched.
 *
 * A caller's own scoreboard: the count, and what came of the calls. Read
 * off campaign_leads by who last updated the row, which is what the sheet
 * stamps when an outcome is set, so it needs nothing new stored.
 */
export default function CallsToday() {
  const { authUser } = useAuth();
  const me = authUser?.accessEmployeeId ?? "";
  const [rows, setRows] = useState<{ outcome: string | null }[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const load = () => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      supabase
        .from("campaign_leads")
        .select("call_outcome")
        .eq("updated_by", me)
        .gte("updated_at", since.toISOString())
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            setState("failed");
            return;
          }
          setRows(((data ?? []) as { call_outcome: string | null }[]).map((r) => ({ outcome: r.call_outcome })));
          setState("ok");
        });
    };
    load();
    const stop = subscribeChanges("dashboard-calls-today", ["campaign_leads"], load);
    return () => {
      cancelled = true;
      stop();
    };
  }, [me]);

  const byOutcome = new Map<string, number>();
  for (const r of rows) {
    const key = r.outcome?.trim() || "No outcome yet";
    byOutcome.set(key, (byOutcome.get(key) ?? 0) + 1);
  }
  const ordered = [...byOutcome.entries()].sort((a, b) => b[1] - a[1]);
  const label = (value: string) => CALL_OUTCOME_OPTIONS.find((o) => o.value === value)?.label ?? value;

  return (
    <div className="flex flex-col h-full bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#f4f4f4] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-[#fafafa] border border-[#f0f0f0]">
            <PhoneOutgoing className="w-3.5 h-3.5 text-[#666]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0a0a0a]">Calls Today</p>
            <p className="text-[10px] text-[#999]">What you got through, by outcome</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-b border-[#f4f4f4] shrink-0">
        <p className="text-3xl font-bold tabular-nums leading-none text-[#0a0a0a]">
          {state === "loading" ? "–" : rows.length.toLocaleString()}
        </p>
        <p className="text-[10px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">
          {rows.length === 1 ? "Row worked today" : "Rows worked today"}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {state === "failed" ? (
          <p className="text-xs text-[#999] text-center py-6">Couldn&apos;t load today&apos;s calls.</p>
        ) : ordered.length === 0 ? (
          <div className="text-center py-6">
            <PhoneOutgoing className="w-5 h-5 text-[#ddd] mx-auto mb-2" />
            <p className="text-xs text-[#999]">Nothing worked yet today. It fills in as you go.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {ordered.map(([outcome, n]) => (
              <div key={outcome} className="flex items-center gap-2">
                <span
                  className={`flex-1 min-w-0 truncate text-[11px] font-medium px-2 py-1 rounded ${
                    CALL_OUTCOME_STYLES[outcome] ?? "bg-[#f5f5f5] text-[#666]"
                  }`}
                >
                  {label(outcome)}
                </span>
                <span className="text-[12px] font-semibold tabular-nums text-[#0a0a0a] w-8 text-right">{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-[#f4f4f4] shrink-0">
        <Link
          href="/leads/campaigns"
          className="flex items-center gap-1 text-xs text-[#666] hover:text-[#0a0a0a] transition-colors font-medium"
        >
          Open a call sheet <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
