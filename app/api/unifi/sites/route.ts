import { NextResponse } from "next/server";
import { getSites, getHosts, getIspMetrics, ispMetricsToIssuePeriods, isConfigured } from "@/lib/unifi";
import type { UiEnrichedSite, UiEnrichedWan } from "@/lib/unifi";
import { classifyIpAssignment } from "@/lib/ip-assignment";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  try {
    const [sitesResult, hostsResult, metricsResult] = await Promise.allSettled([
      getSites(),
      getHosts(),
      getIspMetrics(),
    ]);

    const sites = sitesResult.status === "fulfilled" ? (sitesResult.value.data ?? []) : [];
    const hosts = hostsResult.status === "fulfilled" ? (hostsResult.value.data ?? []) : [];
    const metrics = metricsResult.status === "fulfilled" ? (metricsResult.value.data ?? []) : [];

    // Build hostId → host map
    const hostMap = new Map(hosts.map((h) => [h.id, h]));
    const metricsMap = new Map(metrics.map((m) => [m.siteId, m]));

    // Resolve every distinct WAN IP's static/dynamic hint once up front (in
    // parallel, deduped) rather than per-site, since the same IP can repeat
    // across sites and each lookup has its own network round trip.
    const allWanIps = new Set<string>();
    for (const site of sites) {
      for (const w of Object.values(site.statistics.wans ?? {})) {
        if (w.externalIp) allWanIps.add(w.externalIp);
      }
    }
    const ipTypeMap = new Map<string, { type: "static" | "dynamic" | "unknown"; hostname?: string }>();
    await Promise.allSettled(
      Array.from(allWanIps).map(async (ip) => {
        ipTypeMap.set(ip, await classifyIpAssignment(ip));
      })
    );

    const enriched: UiEnrichedSite[] = sites.flatMap((site) => {
      try {
        const host = hostMap.get(site.hostId);
        const rs = host?.reportedState;
        const primaryWan = rs?.wans?.find((w) => w.enabled !== false) ?? rs?.wans?.[0];
        const rawWanUptime = site.statistics.percentages?.wanUptime;
        const wanUptime = typeof rawWanUptime === "number" ? rawWanUptime : null;

        // Per-WAN/ISP breakdown (statistics.wans is keyed "WAN", "WAN2", ... —
        // present when a site has failover/secondary internet configured).
        const wanEntries = Object.entries(site.statistics.wans ?? {});
        wanEntries.sort(([a], [b]) => (a === "WAN" ? -1 : b === "WAN" ? 1 : a.localeCompare(b)));
        // Pick the LAN gateway IP out of the console's address list — private
        // IPv4 range, preferring one ending in ".1" (the typical gateway host).
        const privateIps = (rs?.ipAddrs ?? []).filter((ip) =>
          /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
        );
        const lanIp = privateIps.find((ip) => ip.endsWith(".1")) ?? privateIps[0] ?? "";

        const wans: UiEnrichedWan[] = wanEntries.map(([key, w], i) => {
          const ipInfo = w.externalIp ? ipTypeMap.get(w.externalIp) : undefined;
          return {
            key,
            label: i === 0 ? "Primary" : wanEntries.length === 2 ? "Secondary" : key,
            ipv4: w.externalIp ?? "",
            ispName: w.ispInfo?.name ?? "",
            ispOrganization: w.ispInfo?.organization ?? "",
            asn: w.ispInfo?.asn ?? null,
            wanUptime: typeof w.wanUptime === "number" ? w.wanUptime : null,
            ipType: ipInfo?.type ?? "unknown",
            ipTypeHostname: ipInfo?.hostname,
          };
        });

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
          // Prefer the continuous isp-metrics series over the sparse
          // anomaly-only log — falls back only if that site is missing
          // from the isp-metrics response.
          internetIssues: (() => {
            const m = metricsMap.get(site.siteId);
            return m ? ispMetricsToIssuePeriods(m.periods) : (site.statistics.internetIssues ?? []);
          })(),
          firmwareVersion: rs?.hardware?.firmwareVersion ?? "",
          wans,
          mac: rs?.hardware?.mac ?? "",
          serialNumber: rs?.hardware?.serialno ?? "",
          timezone: rs?.timezone ?? "",
          osVersion: rs?.version ?? "",
          lanIp,
          statistics: {
            ...site.statistics,
            counts: {
              totalDevice: site.statistics?.counts?.totalDevice ?? 0,
              offlineDevice: site.statistics?.counts?.offlineDevice ?? 0,
              gatewayDevice: site.statistics?.counts?.gatewayDevice ?? 0,
              wifiDevice: site.statistics?.counts?.wifiDevice ?? 0,
              wiredDevice: site.statistics?.counts?.wiredDevice ?? 0,
              wifiClient: site.statistics?.counts?.wifiClient ?? 0,
              wiredClient: site.statistics?.counts?.wiredClient ?? 0,
              guestClient: site.statistics?.counts?.guestClient ?? 0,
              criticalNotification: site.statistics?.counts?.criticalNotification ?? 0,
              pendingUpdateDevice: site.statistics?.counts?.pendingUpdateDevice ?? 0,
              offlineWifiDevice: site.statistics?.counts?.offlineWifiDevice ?? 0,
              offlineWiredDevice: site.statistics?.counts?.offlineWiredDevice ?? 0,
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
