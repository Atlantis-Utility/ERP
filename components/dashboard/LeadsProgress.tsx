"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";
import {
  EMPTY_FILTERS,
  fetchLeadStats,
  fetchStageCounts,
  fetchLeadsPage,
  useLeadsRevision,
  type Lead,
  type LeadStats,
} from "@/lib/db/leads";
import { STATUS_LABELS, STATUS_STYLES, isFollowUpOverdue } from "@/lib/leads-constants";

/**
 * How the leads assigned to this person are going.
 *
 * The dashboard's default second panel used to be the project timeline,
 * which is an empty box for somebody who works leads and holds no
 * projects. Everything here comes through the same RLS-scoped calls the
 * Leads page uses, so a caller sees their own numbers and an administrator
 * sees all of them, without this component knowing the difference.
 */
export default function LeadsProgress() {
  const revision = useLeadsRevision();
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [stages, setStages] = useState<Record<string, { n: number }>>({});
  const [next, setNext] = useState<Lead[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchLeadStats(EMPTY_FILTERS),
      fetchStageCounts(EMPTY_FILTERS),
      // Soonest follow-ups first: the question this panel answers is "who
      // am I supposed to be calling".
      fetchLeadsPage({ filters: EMPTY_FILTERS, sort: "follow_up_date", desc: false, page: 0, pageSize: 5 }),
    ])
      .then(([s, st, rows]) => {
        if (cancelled) return;
        setStats(s);
        setStages(st);
        setNext(rows.filter((l: Lead) => Boolean(l.followUpDate)));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const ordered = Object.entries(stages)
    .filter(([, v]) => v.n > 0)
    .sort((a, b) => b[1].n - a[1].n);
  const biggest = ordered[0]?.[1].n ?? 0;

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-3 gap-px bg-[#f4f4f4] border-b border-[#f4f4f4]">
        {[
          { label: "Leads", value: stats?.total ?? 0, href: "/leads" },
          { label: "Follow-ups due", value: stats?.overdue ?? 0, href: "/leads", warn: (stats?.overdue ?? 0) > 0 },
          { label: "Appointments", value: stats?.appointments ?? 0, href: "/leads" },
        ].map((k) => (
          <Link key={k.label} href={k.href} className="bg-white px-5 py-4 hover:bg-[#fafafa] transition-colors">
            <p
              className={`text-xl font-bold tabular-nums leading-none ${
                k.warn ? "text-[#f31260]" : "text-[#0a0a0a]"
              }`}
            >
              {stats === null ? "–" : k.value.toLocaleString()}
            </p>
            <p className="text-[10px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">{k.label}</p>
          </Link>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {failed ? (
          <p className="text-xs text-[#999] text-center py-8">Couldn&apos;t load your leads just now.</p>
        ) : ordered.length === 0 ? (
          <div className="text-center py-10">
            <Target className="w-5 h-5 text-[#ddd] mx-auto mb-2" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-0.5">No leads assigned to you yet</p>
            <p className="text-xs text-[#999]">They&apos;ll show up here as soon as someone assigns you some.</p>
          </div>
        ) : (
          <>
            <p className="text-[10px] font-semibold text-[#bbb] uppercase tracking-wider mb-2">By stage</p>
            <div className="space-y-1.5 mb-5">
              {ordered.map(([status, v]) => (
                <Link
                  key={status}
                  href="/leads"
                  className="flex items-center gap-3 group"
                  title={`${v.n} ${STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}`}
                >
                  <span className="w-28 shrink-0 text-[11px] text-[#666] truncate group-hover:text-[#0a0a0a] transition-colors">
                    {STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}
                  </span>
                  {/* A bar rather than a number alone: the shape of the
                      pipeline is the thing worth seeing at a glance. */}
                  <span className="flex-1 h-2 rounded-full bg-[#f4f4f4] overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-[#0a0a0a]"
                      style={{ width: `${biggest ? Math.max(4, (v.n / biggest) * 100) : 0}%` }}
                    />
                  </span>
                  <span className="w-10 text-right text-[11px] font-semibold tabular-nums text-[#0a0a0a]">
                    {v.n.toLocaleString()}
                  </span>
                </Link>
              ))}
            </div>

            {next.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-[#bbb] uppercase tracking-wider mb-2">Next follow-ups</p>
                <div className="space-y-1">
                  {next.map((l) => {
                    const late = isFollowUpOverdue(l.followUpDate, l.status);
                    return (
                      <Link
                        key={l.id}
                        href={`/leads?lead=${encodeURIComponent(l.id)}`}
                        className="flex items-center gap-2 px-2 py-1.5 -mx-2 rounded-lg hover:bg-[#fafafa] transition-colors"
                      >
                        <span className="flex-1 min-w-0 text-[12px] text-[#0a0a0a] truncate">{l.companyName}</span>
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                            STATUS_STYLES[l.status] ?? "bg-[#f5f5f5] text-[#666]"
                          }`}
                        >
                          {STATUS_LABELS[l.status] ?? l.status}
                        </span>
                        <span
                          className={`text-[11px] tabular-nums shrink-0 ${late ? "text-[#f31260] font-medium" : "text-[#999]"}`}
                        >
                          {l.followUpDate}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="px-5 py-3 border-t border-[#f4f4f4] shrink-0">
        <Link
          href="/leads"
          className="flex items-center gap-1 text-xs text-[#666] hover:text-[#0a0a0a] transition-colors font-medium"
        >
          Open leads <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
