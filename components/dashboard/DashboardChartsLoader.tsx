"use client";

import dynamic from "next/dynamic";

interface MonthlyPoint { month: string; revenue: number; expenses: number; }

const DashboardCharts = dynamic(() => import("./DashboardCharts"), {
  ssr: false,
  loading: () => (
    <div className="mb-6 bg-white border border-[#eaeaea] rounded-xl h-[360px] animate-pulse" />
  ),
});

export default function DashboardChartsLoader({ monthlyData }: { monthlyData: MonthlyPoint[] }) {
  return <DashboardCharts monthlyData={monthlyData} />;
}
