import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/unifi";

const API_KEY = process.env.UNIFI_API_KEY;

async function rawFetch(path: string) {
  const res = await fetch(`https://api.ui.com${path}`, {
    headers: { "x-api-key": API_KEY!, Accept: "application/json" },
    cache: "no-store",
  });
  return res.json();
}

export async function GET(req: Request) {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const url = new URL(req.url);
  const search = url.searchParams.get("name")?.toLowerCase() ?? "";

  const [sitesRaw, hostsRaw] = await Promise.all([
    rawFetch("/ea/sites?pageSize=200"),
    rawFetch("/ea/hosts?pageSize=200"),
  ]);

  const sites: Record<string, unknown>[] = sitesRaw?.data ?? [];
  const hosts: Record<string, unknown>[] = hostsRaw?.data ?? [];

  const hostMap = new Map(hosts.map((h) => [h.id as string, h]));
  const currentIdx = Math.floor(Date.now() / 1000 / 300);

  // Find site by name search, or just pick first site
  const matchingSite = sites.find((s) => {
    const host = hostMap.get(s.hostId as string);
    const name = (host as { reportedState?: { name?: string } })?.reportedState?.name ?? "";
    return search ? name.toLowerCase().includes(search) : true;
  });

  if (!matchingSite) {
    return NextResponse.json({ error: "no site found", search, total: sites.length });
  }

  const host = hostMap.get(matchingSite.hostId as string) ?? {};
  const rs = (host as { reportedState?: Record<string, unknown> })?.reportedState ?? {};

  // Show ALL keys in reportedState and statistics
  const rsKeys = Object.keys(rs);
  const statsKeys = Object.keys((matchingSite.statistics as Record<string, unknown>) ?? {});

  // Show the actual wans and internetIssues from statistics
  const stats = matchingSite.statistics as Record<string, unknown>;

  // Show raw internetIssues5min periods with their actual content
  const periods: { index: number; [key: string]: unknown }[] =
    (rs.internetIssues5min as { periods?: { index: number }[] })?.periods ?? [];

  // Find periods within our 6h bar window
  const inWindow = periods.filter((p) => currentIdx - p.index <= 72);
  const withFlags = periods.filter((p) =>
    Object.keys(p).filter((k) => k !== "index").length > 0
  );

  return NextResponse.json({
    currentIdx,
    site_name: rs.name,
    site_state: rs.state,
    reportedState_keys: rsKeys,
    statistics_keys: statsKeys,
    // Raw statistics fields that might have uptime data
    statistics_percentages: stats.percentages,
    statistics_wans: stats.wans,
    statistics_internetIssues: stats.internetIssues,
    // internetIssues5min summary
    periods_total: periods.length,
    periods_in_6h_window: inWindow.length,
    periods_with_flags: withFlags.length,
    // Sample periods with flags (actual downtime events)
    flagged_periods_sample: withFlags.slice(0, 5).map((p) => ({
      ...p,
      minutes_ago: (currentIdx - p.index) * 5,
    })),
    // All periods in the 6h window
    window_periods: inWindow,
  });
}
