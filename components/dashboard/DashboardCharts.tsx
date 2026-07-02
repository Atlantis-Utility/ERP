"use client";

import {
  AreaChart, Area,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";

interface MonthlyPoint { month: string; revenue: number; expenses: number; }

function fmt(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value}`;
}

const tooltipStyle = {
  background: "#fff",
  border: "1px solid #eaeaea",
  borderRadius: "8px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontSize: "12px",
};

export default function DashboardCharts({ monthlyData }: { monthlyData: MonthlyPoint[] }) {
  return (
    <div className="bg-white border border-[#eaeaea] rounded-xl p-5 mb-6">
      <p className="text-sm font-semibold text-[#0a0a0a]">Revenue Overview</p>
      <p className="text-xs text-[#999] mt-0.5 mb-4">Monthly revenue vs expenses, 2025</p>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={monthlyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0070f3" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#0070f3" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f31260" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#f31260" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#eaeaea" />
          <XAxis dataKey="month" tick={{ fill: "#999", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmt} tick={{ fill: "#999", fontSize: 12 }} axisLine={false} tickLine={false} width={56} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(Number(v))} />
          <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#0070f3" strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
          <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#f31260" strokeWidth={2} fill="url(#expGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
