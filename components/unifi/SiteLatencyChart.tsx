"use client";

import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { UiIssuePeriod } from "@/lib/unifi";

function buildChartData(issues: UiIssuePeriod[]) {
  const currentIdx = Math.floor(Date.now() / 1000 / 300);
  const N = 72;
  const map = new Map(issues.map((p) => [p.index, p]));

  return Array.from({ length: N }, (_, i) => {
    const idx = currentIdx - (N - 1 - i);
    const p = map.get(idx);
    const date = new Date(idx * 300 * 1000);
    const latency = p?.latency_avg_ms ?? null;
    const maxLatency = p?.latency_max_ms ?? null;

    return {
      time: date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
      latency,
      maxLatency,
      lossShade: p?.packetLoss ? (latency ?? 80) * 2 : null,
      downShade: p?.wanDowntime ? 9999 : null,
    };
  });
}

interface TooltipPayload {
  dataKey: string;
  value: number;
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const latency = payload.find((p) => p.dataKey === "latency")?.value;
  const maxLatency = payload.find((p) => p.dataKey === "maxLatency")?.value;
  const hasLoss = payload.find((p) => p.dataKey === "lossShade")?.value;
  const hasDown = payload.find((p) => p.dataKey === "downShade")?.value;

  return (
    <div className="bg-white border border-[#eaeaea] rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="text-[#999] mb-1">{label}</p>
      {latency != null && <p className="text-[#06b6d4] font-medium">Avg: {latency} ms</p>}
      {maxLatency != null && <p className="text-[#93c5fd]">Max: {maxLatency} ms</p>}
      {hasDown ? (
        <p className="text-[#f31260] font-medium mt-1">WAN Down</p>
      ) : hasLoss ? (
        <p className="text-[#f59e0b] font-medium mt-1">Packet Loss</p>
      ) : null}
    </div>
  );
}

export default function SiteLatencyChart({ issues }: { issues: UiIssuePeriod[] }) {
  const data = buildChartData(issues);
  const hasData = data.some((d) => d.latency !== null);

  if (!hasData) {
    return (
      <div className="h-52 flex flex-col items-center justify-center gap-2">
        <p className="text-sm text-[#999]">No internet activity data in the last 6 hours</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="latencyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />

        <XAxis
          dataKey="time"
          tick={{ fontSize: 10, fill: "#bbb" }}
          tickLine={false}
          axisLine={false}
          interval={11}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#bbb" }}
          tickLine={false}
          axisLine={false}
          unit=" ms"
          width={48}
        />

        <Tooltip content={<CustomTooltip />} />

        {/* WAN downtime — dark red wash */}
        <Area
          dataKey="downShade"
          fill="rgba(243,18,96,0.05)"
          stroke="none"
          isAnimationActive={false}
          legendType="none"
        />

        {/* Packet loss — amber wash */}
        <Area
          dataKey="lossShade"
          fill="rgba(245,165,36,0.1)"
          stroke="none"
          isAnimationActive={false}
          legendType="none"
        />

        {/* Latency gradient fill */}
        <Area
          dataKey="latency"
          fill="url(#latencyFill)"
          stroke="none"
          isAnimationActive={false}
          legendType="none"
          connectNulls
        />

        {/* Max latency — light dashed */}
        <Line
          dataKey="maxLatency"
          stroke="#bae6fd"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />

        {/* Avg latency — main line */}
        <Line
          dataKey="latency"
          stroke="#06b6d4"
          strokeWidth={2}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
