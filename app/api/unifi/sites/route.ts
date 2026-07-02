import { NextResponse } from "next/server";
import { getSites, getHosts, isConfigured } from "@/lib/unifi";
import type { UiEnrichedSite } from "@/lib/unifi";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  try {
    const [sitesResult, hostsResult] = await Promise.allSettled([getSites(), getHosts()]);

    const sites = sitesResult.status === "fulfilled" ? (sitesResult.value.data ?? []) : [];
    const hosts = hostsResult.status === "fulfilled" ? (hostsResult.value.data ?? []) : [];

    // Build hostId → host map
    const hostMap = new Map(hosts.map((h) => [h.id, h]));

    const enriched: UiEnrichedSite[] = sites.flatMap((site) => {
      try {
        const host = hostMap.get(site.hostId);
        const rs = host?.reportedState;
        const primaryWan = rs?.wans?.find((w) => w.enabled !== false) ?? rs?.wans?.[0];
        const rawWanUptime = site.statistics.percentages?.wanUptime;
        const wanUptime = typeof rawWanUptime === "number" ? rawWanUptime : null;

        return [{
          ...site,
          displayName: rs?.name ?? rs?.hostname ?? site.hostId.slice(0, 12),
          connected: rs?.state === "connected",
          wanUptime,
          hardware: {
            shortname: rs?.hardware?.shortname ?? site.statistics.gateway?.shortname ?? "—",
            name: rs?.hardware?.name ?? "Unknown",
          },
          location: rs?.location?.text ?? "",
          wanIp: primaryWan?.ipv4 ?? host?.ipAddress ?? "",
          ispName: site.statistics.ispInfo?.name ?? "",
          internetIssues: site.statistics.internetIssues ?? [],
          firmwareVersion: rs?.hardware?.firmwareVersion ?? "",
          statistics: {
            ...site.statistics,
            counts: {
              totalDevice: 0,
              offlineDevice: 0,
              gatewayDevice: 0,
              wifiDevice: 0,
              wiredDevice: 0,
              wifiClient: 0,
              wiredClient: 0,
              guestClient: 0,
              criticalNotification: 0,
              pendingUpdateDevice: 0,
              offlineWifiDevice: 0,
              offlineWiredDevice: 0,
              ...site.statistics?.counts,
            },
          },
        }];
      } catch {
        // Skip sites that fail enrichment rather than failing the whole request
        return [];
      }
    });

    // Deduplicate by siteId (API can return duplicate entries)
    const seen = new Set<string>();
    const deduped = enriched.filter((s) => {
      if (seen.has(s.siteId)) return false;
      seen.add(s.siteId);
      return true;
    });

    // Sort: connected sites first, then by name
    deduped.sort((a, b) => {
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });

    return NextResponse.json({ data: deduped });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
