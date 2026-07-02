import { NextRequest, NextResponse } from "next/server";
import { getSites, getHosts, isConfigured } from "@/lib/unifi";
import type { UiAlert, UiIssuePeriod } from "@/lib/unifi";

// Convert a period index to an ISO timestamp.
// Periods are 5-min slots; maxIndex is the most-recent slot (≈ now).
function periodToTime(index: number, maxIndex: number, now: number): string {
  const msAgo = (maxIndex - index) * 5 * 60 * 1000;
  return new Date(now - msAgo).toISOString();
}

export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const siteIdFilter = req.nextUrl.searchParams.get("siteId");

  try {
    const [sitesResult, hostsResult] = await Promise.allSettled([
      getSites(),
      getHosts(),
    ]);

    const allSites = sitesResult.status === "fulfilled"
      ? (sitesResult.value.data ?? [])
      : [];
    const hosts = hostsResult.status === "fulfilled"
      ? (hostsResult.value.data ?? [])
      : [];

    const hostMap = new Map(hosts.map((h) => [h.id, h]));

    const siteNameMap = new Map<string, string>();
    for (const site of allSites) {
      const host = hostMap.get(site.hostId);
      const name =
        host?.reportedState?.name ??
        host?.reportedState?.hostname ??
        site.siteId;
      siteNameMap.set(site.siteId, name);
    }

    const sites = siteIdFilter
      ? allSites.filter((s) => s.siteId === siteIdFilter)
      : allSites;

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const alerts: UiAlert[] = [];

    for (const site of sites) {
      const c = site.statistics.counts;
      const name = siteNameMap.get(site.siteId) ?? site.siteId;
      const host = hostMap.get(site.hostId);

      // Real issue periods from the controller (same data as the uptime bar)
      const periods: UiIssuePeriod[] =
        host?.reportedState?.internetIssues5min?.periods ?? [];

      // Sort descending so index 0 = most recent
      const sorted = [...periods].sort((a, b) => b.index - a.index);
      const maxIndex = sorted[0]?.index ?? 71;

      // Last 12 periods = last hour
      const recentPeriods = sorted.slice(0, 12);

      // ── Critical notifications ──────────────────────────────────────────────
      if (c.criticalNotification > 0) {
        const issueDescriptions: string[] = [];

        // WAN downtime in the last hour
        const wanDownPeriods = recentPeriods.filter((p) => p.wanDowntime);
        if (wanDownPeriods.length > 0) {
          issueDescriptions.push(`WAN offline ${wanDownPeriods.length * 5} min`);
        }

        // Packet loss in the last hour
        const plPeriods = recentPeriods.filter((p) => p.packetLoss);
        if (plPeriods.length > 0) {
          issueDescriptions.push(`packet loss ${plPeriods.length * 5} min`);
        }

        // High latency in the last hour — include real avg/max ms
        const hlPeriods = recentPeriods.filter((p) => p.high_latency);
        if (hlPeriods.length > 0) {
          const avgMs =
            hlPeriods.reduce((s, p) => s + (p.latency_avg_ms ?? 0), 0) /
            hlPeriods.length;
          const maxMs = Math.max(...hlPeriods.map((p) => p.latency_max_ms ?? 0));
          issueDescriptions.push(
            `high latency avg ${Math.round(avgMs)} ms, max ${maxMs} ms`
          );
        }

        // Fallback: WAN uptime percentage from site stats
        if (issueDescriptions.length === 0) {
          const wanUptime = site.statistics.percentages?.wanUptime;
          if (wanUptime !== undefined && wanUptime < 99.9) {
            issueDescriptions.push(`WAN uptime ${wanUptime.toFixed(1)}%`);
          }
        }

        // Timestamp = when the most recent issue period occurred
        const latestIssue = sorted.find(
          (p) => p.wanDowntime || p.packetLoss || p.high_latency
        );
        const created_at = latestIssue
          ? periodToTime(latestIssue.index, maxIndex, nowMs)
          : nowIso;

        const base = `${c.criticalNotification} critical notification${c.criticalNotification !== 1 ? "s" : ""}`;
        const message =
          issueDescriptions.length > 0
            ? `${base} · ${issueDescriptions.join(", ")}`
            : base;

        alerts.push({
          id: `critical-${site.siteId}`,
          type: "critical_notification",
          severity: "critical",
          message,
          created_at,
          resolved_at: null,
          site_id: site.siteId,
          siteName: name,
        });
      }

      // ── Offline devices ─────────────────────────────────────────────────────
      if (c.offlineDevice > 0) {
        const parts: string[] = [];
        if (c.offlineWiredDevice > 0) parts.push(`${c.offlineWiredDevice} wired`);
        if (c.offlineWifiDevice > 0) parts.push(`${c.offlineWifiDevice} WiFi`);
        const detail = parts.length ? ` (${parts.join(", ")})` : "";

        // Use most recent WAN-down period as the timestamp proxy for offline events
        const lastDown = sorted.find((p) => p.wanDowntime);
        const created_at = lastDown
          ? periodToTime(lastDown.index, maxIndex, nowMs)
          : nowIso;

        alerts.push({
          id: `offline-device-${site.siteId}`,
          type: "device_offline",
          severity: "high",
          message: `${c.offlineDevice} device${c.offlineDevice !== 1 ? "s" : ""} offline${detail}`,
          created_at,
          resolved_at: null,
          site_id: site.siteId,
          siteName: name,
        });
      }

      // ── Pending firmware updates ────────────────────────────────────────────
      if (c.pendingUpdateDevice > 0) {
        alerts.push({
          id: `update-${site.siteId}`,
          type: "pending_update",
          severity: "info",
          message: `${c.pendingUpdateDevice} firmware update${c.pendingUpdateDevice !== 1 ? "s" : ""} available`,
          created_at: nowIso,
          resolved_at: null,
          site_id: site.siteId,
          siteName: name,
        });
      }
    }

    const SEV_ORDER: Record<string, number> = {
      critical: 0, high: 1, warning: 2, info: 3,
    };
    alerts.sort((a, b) => {
      const sa = SEV_ORDER[a.severity ?? "info"] ?? 3;
      const sb = SEV_ORDER[b.severity ?? "info"] ?? 3;
      return sa - sb;
    });

    return NextResponse.json({ data: alerts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
