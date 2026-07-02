import Header from "@/components/layout/Header";
import { formatDate } from "@/lib/utils";
import {
  Users,
  Layers,
  Award,
  UserPlus,
  UserMinus,
  Shield,
  FileText,
  BarChart3,
  Calendar,
  Download,
  Plus,
} from "lucide-react";

type ReportCategory = "HR" | "Operations" | "Legal";

interface Report {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  category: ReportCategory;
  lastGenerated: string;
  format: string;
}

const categoryConfig: Record<ReportCategory, { bg: string; text: string; iconBg: string; iconText: string }> = {
  HR: { bg: "bg-[#e8f2ff]", text: "text-[#0070f3]", iconBg: "bg-[#e8f2ff]", iconText: "text-[#0070f3]" },
  Operations: { bg: "bg-[#fff8e6]", text: "text-[#f5a524]", iconBg: "bg-[#fff8e6]", iconText: "text-[#f5a524]" },
  Legal: { bg: "bg-[#f1f1f1]", text: "text-[#666]", iconBg: "bg-[#f1f1f1]", iconText: "text-[#666]" },
};

const reports: Report[] = [
  { id: "r-001", title: "Headcount Report", description: "Employee count by department, status, and location with trend analysis", icon: Users, category: "HR", lastGenerated: "2025-06-15", format: "PDF / CSV" },
  { id: "r-004", title: "Project Status Report", description: "Status, progress, and timelines for all active and completed projects", icon: Layers, category: "Operations", lastGenerated: "2025-06-18", format: "PDF" },
  { id: "r-005", title: "Performance Reviews", description: "Annual and quarterly performance review summaries by team", icon: Award, category: "HR", lastGenerated: "2025-05-30", format: "PDF" },
  { id: "r-007", title: "Hiring Pipeline", description: "Open positions, candidate pipeline, and time-to-hire metrics", icon: UserPlus, category: "HR", lastGenerated: "2025-06-12", format: "PDF / CSV" },
  { id: "r-008", title: "Attrition Analysis", description: "Employee turnover rates, exit interview data, and retention trends", icon: UserMinus, category: "HR", lastGenerated: "2025-05-01", format: "PDF" },
  { id: "r-009", title: "Compliance Report", description: "Regulatory compliance status, audit trail, and risk assessment", icon: Shield, category: "Legal", lastGenerated: "2025-04-30", format: "PDF" },
];

export default function ReportsPage() {
  return (
    <div>
      <Header
        title="Reports"
        subtitle="Generate and export business reports"
        actions={
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors">
              <Calendar className="w-4 h-4" />
              Schedule
            </button>
            <button className="flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors">
              <Plus className="w-4 h-4" />
              Custom Report
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <FileText className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">6</p>
          <p className="text-sm text-[#666] mb-1">Report Types</p>
          <p className="text-xs text-[#999]">Available templates</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <BarChart3 className="w-4 h-4 text-[#17c964]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">7</p>
          <p className="text-sm text-[#666] mb-1">Generated</p>
          <p className="text-xs text-[#999]">This month</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Calendar className="w-4 h-4 text-[#7c3aed]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">3</p>
          <p className="text-sm text-[#666] mb-1">Scheduled</p>
          <p className="text-xs text-[#999]">Auto-generate</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Download className="w-4 h-4 text-[#f5a524]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">24</p>
          <p className="text-sm text-[#666] mb-1">Exported</p>
          <p className="text-xs text-[#999]">Total downloads</p>
        </div>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {reports.map((report) => {
          const cat = categoryConfig[report.category];
          const Icon = report.icon;
          return (
            <div
              key={report.id}
              className="bg-white border border-[#eaeaea] rounded-xl p-5 hover:border-[#ccc] transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className={`p-2.5 rounded-lg ${cat.iconBg}`}>
                  <Icon className={`w-4 h-4 ${cat.iconText}`} />
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${cat.bg} ${cat.text}`}>
                  {report.category}
                </span>
              </div>
              <p className="text-sm font-semibold text-[#0a0a0a] mt-3 mb-1">{report.title}</p>
              <p className="text-xs text-[#666] leading-5 mb-4">{report.description}</p>
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-[#999]">
                  Last: {formatDate(report.lastGenerated)} · {report.format}
                </p>
                <div className="flex items-center gap-1.5">
                  <button className="text-xs font-medium text-[#666] px-2.5 py-1.5 rounded-lg hover:bg-[#f1f1f1] transition-colors">
                    View
                  </button>
                  <button className="flex items-center gap-1 border border-[#eaeaea] bg-white text-xs font-medium text-[#0a0a0a] px-2.5 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors">
                    <Download className="w-3 h-3" />
                    Export
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
