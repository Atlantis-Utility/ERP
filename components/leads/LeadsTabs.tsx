"use client";

import Link from "next/link";
import { Megaphone, Target } from "lucide-react";

/**
 * Two ways of looking at the same leads: the whole list, or the campaigns
 * carved out of it.
 *
 * These are routes rather than local tab state so that a campaign's call
 * sheet has somewhere to go back to. With the tab held in state, leaving a
 * sheet could only return to /leads, which dropped the reader back on the
 * full lead list instead of the campaign list they came from.
 *
 * Page access is unaffected: /leads and /leads/campaigns are separate grants
 * (see lib/nav-pages.ts), which is why the second tab is only offered when
 * the reader actually holds it.
 */
export default function LeadsTabs({
  active,
  canSeeCampaigns,
}: {
  active: "leads" | "campaigns";
  canSeeCampaigns: boolean;
}) {
  const tabs = [
    { key: "leads" as const, href: "/leads", label: "All Leads", icon: Target },
    ...(canSeeCampaigns
      ? [{ key: "campaigns" as const, href: "/leads/campaigns", label: "Campaigns", icon: Megaphone }]
      : []),
  ];

  return (
    <div className="flex items-center gap-1 mb-5 border-b border-[#eaeaea]">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`flex items-center gap-2 text-[13px] font-medium px-3 py-2.5 -mb-px border-b-2 transition-colors ${
            active === t.key
              ? "border-[#0a0a0a] text-[#0a0a0a]"
              : "border-transparent text-[#999] hover:text-[#666]"
          }`}
        >
          <t.icon className="w-4 h-4" />
          {t.label}
        </Link>
      ))}
    </div>
  );
}
