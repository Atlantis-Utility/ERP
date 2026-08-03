"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export interface TimelineMonth {
  key: string;
  label: string;
  active: number;
  completed: number;
  onHold: number;
  overdue: number;
}

export const TIMELINE_SERIES = [
  { key: "active",    label: "Active",    color: "#818cf8" },
  { key: "completed", label: "Completed", color: "#22c55e" },
  { key: "onHold",    label: "On Hold",   color: "#fbbf24" },
  { key: "overdue",   label: "Overdue",   color: "#fb923c" },
] as const;

interface TooltipEntry {
  dataKey: string;
  value: number;
  color: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const nonZero = payload.filter((p) => p.value > 0);
  if (nonZero.length === 0) return null;
  return (
    <div className="bg-white border border-[#eaeaea] rounded-lg px-3 py-2 shadow-sm text-xs min-w-32">
      <p className="text-[#0a0a0a] font-medium mb-1">{label}</p>
      {nonZero.map((p) => {
        const series = TIMELINE_SERIES.find((s) => s.key === p.dataKey);
        return (
          <div key={p.dataKey} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[#666]">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: series?.color }} />
              {series?.label}
            </span>
            <span className="font-semibold text-[#0a0a0a] tabular-nums">{p.value}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ProjectTimelineChart({ data }: { data: TimelineMonth[] }) {
  const total = data.reduce((s, m) => s + m.active + m.completed + m.onHold + m.overdue, 0);

  if (total === 0) {
    return <div className="flex items-center justify-center h-full text-sm text-[#999]">No project deadlines in this range</div>;
  }

  const maxCount = Math.max(
    ...data.map((m) => m.active + m.completed + m.onHold + m.overdue === 0 ? 0 : Math.max(m.active, m.completed, m.onHold, m.overdue)),
    1
  );
  const step = Math.max(1, Math.ceil(maxCount / 4));
  const niceMax = step * 4;
  const ticks = Array.from({ length: 5 }, (_, i) => i * step);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barGap={3} barCategoryGap="22%">
        <defs>
          {TIMELINE_SERIES.map((s) => (
            <linearGradient key={s.key} id={`timelineGrad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.9} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#999", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, niceMax]} ticks={ticks} tick={{ fill: "#999", fontSize: 12 }} axisLine={false} tickLine={false} width={32} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#fafafa" }} />
        {TIMELINE_SERIES.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={`url(#timelineGrad-${s.key})`}
            stroke={s.color}
            strokeWidth={1.5}
            radius={[6, 6, 0, 0]}
            maxBarSize={28}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
