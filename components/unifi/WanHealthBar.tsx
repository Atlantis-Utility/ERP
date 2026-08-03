"use client";

import { useState } from "react";
import type { UiIssuePeriod } from "@/lib/unifi";

export const N_BARS = 180; // 180 × 5 min = 15 hours, matching UniFi's display window

// UniFi color scheme
const BAR_GREEN  = "#22c55e"; // healthy
const BAR_GREY   = "#9ca3af"; // offline (WAN down or not reported)
const BAR_YELLOW = "#f59e0b"; // high latency
const BAR_RED    = "#ef4444"; // packet loss

export function expandPeriods(issues: UiIssuePeriod[]): UiIssuePeriod[] {
  const out: UiIssuePeriod[] = [];
  for (const p of issues) {
    const n = Math.min(p.count ?? 1, N_BARS); // guard against malformed huge counts
    for (let i = 0; i < n; i++) out.push({ ...p, index: p.index + i });
  }
  return out;
}

const LEGEND_ITEMS: { color: string; label: string }[] = [
  { color: BAR_GREEN, label: "Operational" },
  { color: BAR_YELLOW, label: "Elevated packet loss" },
  { color: BAR_RED, label: "Packet loss" },
  { color: BAR_GREY, label: "Offline" },
];

function segmentColor(p: UiIssuePeriod | undefined): string {
  if (!p) return BAR_GREEN;
  if (p.wanDowntime || p.notReported) return BAR_GREY;
  if (p.packetLoss) return BAR_RED;
  if (p.highLatency) return BAR_YELLOW;
  return BAR_GREEN;
}

function buildUptimeBars(issues: UiIssuePeriod[], isOffline = false): string[] {
  const currentIdx = Math.floor(Date.now() / 1000 / 300);
  const expanded = expandPeriods(issues);
  const map = new Map(expanded.map((p) => [p.index, p]));

  // Offline gateway can't push period data → bar would look all-green but that's wrong.
  // Only count downtime evidence if it falls within the visible window —
  // old periods outside the window still cause all-green bars if we don't filter.
  const hasDowntimeEvidence = expanded.some((p) => {
    const dist = currentIdx - p.index;
    return dist >= 0 && dist < N_BARS && (p.wanDowntime || p.notReported);
  });
  if (isOffline && !hasDowntimeEvidence) {
    return Array(N_BARS).fill(BAR_GREY);
  }

  return Array.from({ length: N_BARS }, (_, i) => {
    const idx = currentIdx - (N_BARS - 1 - i);
    if (isOffline && i === N_BARS - 1) return BAR_GREY;
    return segmentColor(map.get(idx));
  });
}

function buildGradient(bars: string[]): string {
  // CSS linear-gradient with hard stops — zero sub-pixel gaps
  const stops = bars.flatMap((color, i) => {
    const a = (i / N_BARS) * 100;
    const b = ((i + 1) / N_BARS) * 100;
    return [`${color} ${a}%`, `${color} ${b}%`];
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export default function WanHealthBar({ issues, isOffline = false }: { issues: UiIssuePeriod[]; isOffline?: boolean }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const currentIdx = Math.floor(Date.now() / 1000 / 300);
  const issueMap   = new Map(expandPeriods(issues).map((p) => [p.index, p]));
  const bars       = buildUptimeBars(issues, isOffline);
  const presentColors = new Set(bars);
  const legend = LEGEND_ITEMS.filter((item) => presentColors.has(item.color));

  const now  = new Date();
  const t15h = new Date(now.getTime() - 15 * 60 * 60 * 1000);
  const t7h  = new Date(now.getTime() -  7.5 * 60 * 60 * 1000);

  const tooltipData = hovered !== null ? (() => {
    const segIdx = currentIdx - (N_BARS - 1 - hovered);
    const p      = issueMap.get(segIdx);
    const start  = new Date(segIdx       * 5 * 60 * 1000);
    const end    = new Date((segIdx + 1) * 5 * 60 * 1000);

    // Derive label from the actual rendered bar color, not period flags alone —
    // bars can be forced grey for offline sites with no period data.
    const barColor = bars[hovered];
    let label = "Online";
    let color = BAR_GREEN;
    if (barColor === BAR_GREY) {
      color = BAR_GREY;
      label = (isOffline || p?.wanDowntime) ? "Site Offline" : "Not Reported";
    } else if (barColor === BAR_RED) {
      label = "Packet Loss";   color = BAR_RED;
    } else if (barColor === BAR_YELLOW) {
      label = "High Latency";  color = BAR_YELLOW;
    }

    return { label, color, p, start, end };
  })() : null;

  // Keep tooltip horizontally within the bar (clamp 18%–82%)
  const tipLeft = hovered !== null
    ? `${Math.min(Math.max(((hovered + 0.5) / N_BARS) * 100, 18), 82)}%`
    : "50%";

  return (
    <div className="relative">
      {/* Hover tooltip */}
      {hovered !== null && tooltipData && (
        <div
          className="absolute bottom-[calc(100%+10px)] bg-[#111111] text-white rounded-xl px-3.5 py-2.5 shadow-2xl z-50 w-52 pointer-events-none"
          style={{ left: tipLeft, transform: "translateX(-50%)" }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tooltipData.color }} />
            <span className="text-[12px] font-semibold leading-tight">{tooltipData.label}</span>
          </div>
          {tooltipData.p?.latencyAvgMs != null && (
            <div className="flex items-center justify-between gap-4 mb-1">
              <span className="text-[11px] text-[#888]">Avg. Latency</span>
              <span className="text-[11px] font-medium tabular-nums">{tooltipData.p.latencyAvgMs} ms</span>
            </div>
          )}
          {tooltipData.p?.latencyMaxMs != null && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-[11px] text-[#888]">Max. Latency</span>
              <span className="text-[11px] font-medium tabular-nums">{tooltipData.p.latencyMaxMs} ms</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[#2a2a2a]">
            <span className="text-[10px] text-[#666] tabular-nums">{fmtTime(tooltipData.start)}</span>
            <span className="text-[10px] text-[#444]">–</span>
            <span className="text-[10px] text-[#666] tabular-nums">{fmtTime(tooltipData.end)}</span>
          </div>
        </div>
      )}

      {/* Single gradient bar — no sub-pixel gaps. Invisible divs handle hover. */}
      <div
        className="relative h-2 rounded-sm overflow-hidden"
        style={{ background: buildGradient(bars) }}
        onMouseLeave={() => setHovered(null)}
      >
        {bars.map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0"
            style={{
              left: `${(i / N_BARS) * 100}%`,
              width: `${(1 / N_BARS) * 100}%`,
            }}
            onMouseEnter={() => setHovered(i)}
          />
        ))}
      </div>

      {/* Time labels */}
      <div className="flex items-center justify-between mt-1">
        <span className="text-[9px] text-[#bbb] tabular-nums">{fmtTime(t15h)}</span>
        <span className="text-[9px] text-[#bbb] tabular-nums">{fmtTime(t7h)}</span>
        <span className="text-[9px] text-[#bbb]">Now</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2.5">
        {legend.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-[10px] text-[#999] font-medium">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
