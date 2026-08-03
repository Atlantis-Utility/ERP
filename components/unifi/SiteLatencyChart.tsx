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

  const points = Array.from({ length: N }, (_, i) => {
    const idx = currentIdx - (N - 1 - i);
    const p = map.get(idx);
    const date = new Date(idx * 300 * 1000);
    return {
      time: date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
      latency: p?.latencyAvgMs ?? null,
      maxLatency: p?.latencyMaxMs ?? null,
      packetLossPct: p?.packetLossPct ?? (p?.packetLoss ? 1 : null), // real % when we have it, else a thin sentinel bar
      wanDowntime: Boolean(p?.wanDowntime),
    };
  });

  // The most recent 5-min bucket(s) often haven't reported yet, which left the
  // line stopping short of "now" with a blank gap at the right edge. Carry the
  // last known reading forward across that trailing gap only.
  const lastReported = points.findLast((d) => d.latency !== null)?.latency ?? null;
  if (lastReported !== null) {
    for (let i = points.length - 1; i >= 0 && points[i].latency === null; i--) {
      points[i].latency = lastReported;
    }
  }

  const peakLatency = points.reduce((m, d) => Math.max(m, d.latency ?? 0, d.maxLatency ?? 0), 0);
  const yMax = Math.max(20, Math.ceil((peakLatency * 1.3) / 8) * 8);

  const peakLossPct = points.reduce((m, d) => Math.max(m, d.packetLossPct ?? 0), 0);
  const lossYMax = Math.max(5, Math.ceil(peakLossPct * 1.3));

  const data = points.map((d) => ({
    ...d,
    downShade: d.wanDowntime ? yMax : null,
  }));

  return { data, yMax, lossYMax };
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
  const packetLossPct = payload.find((p) => p.dataKey === "packetLossPct")?.value;
  const hasDown = payload.find((p) => p.dataKey === "downShade")?.value;

  return (
    <div className="bg-white border border-[#eaeaea] rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="text-[#999] mb-1">{label}</p>
      {latency != null && <p className="text-[#06b6d4] font-medium">Avg: {latency} ms</p>}
      {maxLatency != null && <p className="text-[#93c5fd]">Max: {maxLatency} ms</p>}
      {hasDown && <p className="text-[#f31260] font-medium mt-1">WAN Down</p>}
      {!hasDown && packetLossPct != null && (
        <p className="text-[#f59e0b] font-medium mt-1">Packet loss: {packetLossPct}%</p>
      )}
    </div>
  );
}

export default function SiteLatencyChart({
  issues,
  showLatency = true,
  showPacketLoss = true,
}: {
  issues: UiIssuePeriod[];
  showLatency?: boolean;
  showPacketLoss?: boolean;
}) {
  const { data, yMax, lossYMax } = buildChartData(issues);
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
          <linearGradient id="lossFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.22} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
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
          yAxisId="latency"
          domain={[0, yMax]}
          tick={{ fontSize: 10, fill: "#bbb" }}
          tickLine={false}
          axisLine={false}
          unit=" ms"
          width={48}
        />
        {showPacketLoss && (
          <YAxis
            yAxisId="loss"
            orientation="right"
            domain={[0, lossYMax]}
            tick={{ fontSize: 10, fill: "#f0b756" }}
            tickLine={false}
            axisLine={false}
            unit="%"
            width={40}
          />
        )}

        <Tooltip content={<CustomTooltip />} />

        {/* WAN downtime — dark red wash spanning the full chart height (always shown; it's a hard fact, not a toggle) */}
        <Area
          yAxisId="latency"
          dataKey="downShade"
          fill="rgba(243,18,96,0.08)"
          stroke="none"
          isAnimationActive={false}
          legendType="none"
        />

        {showLatency && (
          <>
            {/* Latency gradient fill */}
            <Area
              yAxisId="latency"
              type="monotone"
              dataKey="latency"
              fill="url(#latencyFill)"
              stroke="none"
              isAnimationActive={false}
              legendType="none"
              connectNulls
            />

            {/* Avg latency — main line */}
            <Line
              yAxisId="latency"
              type="monotone"
              dataKey="latency"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </>
        )}

        {showPacketLoss && (
          <>
            {/* Packet loss % — its own gradient fill on the right-hand axis */}
            <Area
              yAxisId="loss"
              type="monotone"
              dataKey="packetLossPct"
              fill="url(#lossFill)"
              stroke="none"
              isAnimationActive={false}
              legendType="none"
            />
            <Line
              yAxisId="loss"
              type="monotone"
              dataKey="packetLossPct"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
