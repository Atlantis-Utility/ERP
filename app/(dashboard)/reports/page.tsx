"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { subscribeProjects } from "@/lib/db/projects";
import { subscribeTasks } from "@/lib/db/tasks";
import { useUnifiedTickets } from "@/lib/tickets/useUnifiedTickets";
import type { Project } from "@/lib/mock-projects";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";
import { formatDate, getAvatarColor, getInitials } from "@/lib/utils";
import { exportProjectReportPdf } from "@/lib/reports/project-report-pdf";
import { exportProjectReportDocx } from "@/lib/reports/project-report-docx";
import { exportTasksReportPdf } from "@/lib/reports/tasks-report-pdf";
import { exportTasksReportDocx } from "@/lib/reports/tasks-report-docx";
import { exportTicketsReportPdf } from "@/lib/reports/tickets-report-pdf";
import { exportTicketsReportDocx } from "@/lib/reports/tickets-report-docx";
import {
  FileText, Download, FileType, Eye, CheckSquare, LifeBuoy,
} from "lucide-react";

export default function ReportsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<KanbanCard[]>([]);
  const { tickets } = useUnifiedTickets();

  useEffect(() => {
    const unsub = subscribeProjects(setProjects);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeTasks(setTasks);
    return unsub;
  }, []);

  const completed = useMemo(() => projects.filter((p) => p.status === "completed"), [projects]);

  function completedTaskCount(projectId: string): { completed: number; total: number } {
    const linked = tasks.filter((t) => t.type === "task" && t.projectId === projectId);
    return { completed: linked.filter((t) => t.column === "done").length, total: linked.length };
  }

  const stats = useMemo(() => {
    const now = new Date();
    const completedThisMonth = completed.filter((p) => {
      if (p.deadlineTbd || !p.deadline) return false;
      const d = new Date(p.deadline);
      return !isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const departments = new Set(completed.map((p) => p.department).filter(Boolean)).size;
    const teamMembers = new Set(completed.flatMap((p) => [p.owner, ...p.team])).size;
    return { total: completed.length, completedThisMonth, departments, teamMembers };
  }, [completed]);

  const completedTasksTotal = useMemo(
    () => tasks.filter((t) => t.type === "task" && t.column === "done").length,
    [tasks]
  );

  const completedTicketsTotal = useMemo(
    () => tickets.filter((t) => t.status === "resolved" || t.status === "closed").length,
    [tickets]
  );

  return (
    <div>
      <Header title="Reports" subtitle="Completion reports for finished projects" />

      {/* Stats */}
      <div className="grid grid-cols-2 md:flex md:items-stretch md:divide-x divide-[#f4f4f4] bg-white border border-[#eaeaea] rounded-xl mb-6 overflow-hidden">
        {[
          { label: "Completed Projects",    value: stats.total,              sub: "With a generated report", valueColor: undefined as string | undefined },
          { label: "Completed This Month",  value: stats.completedThisMonth, sub: "By completion date",      valueColor: undefined as string | undefined },
          { label: "Departments",           value: stats.departments,        sub: "Represented",              valueColor: undefined as string | undefined },
          { label: "Contributors",          value: stats.teamMembers,        sub: "Across completed projects", valueColor: undefined as string | undefined },
        ].map(({ label, value, sub, valueColor }, i, arr) => (
          <div key={label} className={`flex-1 px-5 py-5 hover:bg-[#fafafa] transition-colors ${i < arr.length - 1 ? "border-b md:border-b-0 border-[#f4f4f4]" : ""}`}>
            <p className={`text-2xl font-bold tabular-nums leading-none ${valueColor ?? "text-[#0a0a0a]"}`}>{value}</p>
            <p className="text-[11px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">{label}</p>
            <p className="text-[10px] mt-0.5 text-[#bbb]">{sub}</p>
          </div>
        ))}
      </div>

      {/* Report cards */}
      {completed.length === 0 ? (
        <div className="bg-white border border-[#eaeaea] rounded-xl p-12 text-center">
          <FileText className="w-6 h-6 text-[#999] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#0a0a0a] mb-1">No completed projects yet</p>
          <p className="text-xs text-[#999]">Reports appear here automatically once a project&apos;s status is set to Completed.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {completed.map((project) => {
            const taskCount = completedTaskCount(project.id);
            return (
            <div
              key={project.id}
              onClick={() => router.push(`/reports/project/${project.id}`)}
              className="flex flex-col h-full min-h-57.5 bg-white border border-[#eaeaea] rounded-xl p-5 cursor-pointer transition-all duration-150 hover:border-[#ccc] hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="bg-[#e8fdf0] p-2.5 rounded-lg">
                  <FileText className="w-4 h-4 text-[#17c964]" />
                </div>
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold bg-[#e8fdf0] text-[#17c964]">
                  {project.department || "General"}
                </span>
              </div>
              <p className="text-sm font-semibold text-[#0a0a0a] mb-1 line-clamp-1">{project.name}</p>
              <p className="text-xs text-[#666] leading-5 mb-3 line-clamp-1">
                {project.clientName || "Internal project"} · Owner {project.owner}
              </p>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex -space-x-1.5">
                  {[project.owner, ...project.team.filter((m) => m !== project.owner)].slice(0, 4).map((name) => {
                    const c = getAvatarColor(name);
                    return (
                      <div key={name} className={`w-6 h-6 rounded-full ${c.bg} ${c.text} flex items-center justify-center ring-2 ring-white shrink-0`}>
                        <span className="text-[9px] font-semibold">{getInitials(name)}</span>
                      </div>
                    );
                  })}
                </div>
                <span className="text-[11px] text-[#999]">{project.team.length} team member{project.team.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex items-center gap-1.5 mb-4 text-[11px] text-[#999]">
                <CheckSquare className="w-3 h-3" />
                {taskCount.total > 0
                  ? `${taskCount.completed} of ${taskCount.total} tasks completed`
                  : "No tasks linked"}
              </div>
              <div className="flex items-center justify-between mt-auto pt-1">
                <p className="text-[10px] text-[#999]">
                  Completed {project.deadlineTbd || !project.deadline ? "—" : formatDate(project.deadline)}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/reports/project/${project.id}`); }}
                    className="flex items-center gap-1 text-xs font-medium text-[#666] px-2 py-1.5 rounded-lg hover:bg-[#f1f1f1] transition-colors"
                    title="View Report"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); exportProjectReportPdf(project, tasks); }}
                    className="flex items-center gap-1 border border-[#eaeaea] bg-white text-xs font-medium text-[#0a0a0a] px-2 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
                    title="Download PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                    PDF
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); exportProjectReportDocx(project, tasks); }}
                    className="flex items-center gap-1 border border-[#eaeaea] bg-white text-xs font-medium text-[#0a0a0a] px-2 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
                    title="Download Word"
                  >
                    <FileType className="w-3.5 h-3.5" />
                    Word
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Other Reports */}
      <div className="mt-8">
        <p className="text-sm font-semibold text-[#0a0a0a] mb-1">Other Reports</p>
        <p className="text-xs text-[#999] mb-4">Consolidated reports across all projects</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            onClick={() => router.push("/reports/tasks")}
            className="flex flex-col h-full min-h-57.5 bg-white border border-[#eaeaea] rounded-xl p-5 cursor-pointer transition-all duration-150 hover:border-[#ccc] hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="bg-[#e8f2ff] p-2.5 rounded-lg">
                <CheckSquare className="w-4 h-4 text-[#0070f3]" />
              </div>
            </div>
            <p className="text-sm font-semibold text-[#0a0a0a] mb-1">Completed Tasks Report</p>
            <p className="text-xs text-[#666] leading-5 mb-4">
              {completedTasksTotal} task{completedTasksTotal !== 1 ? "s" : ""} completed across all projects
            </p>
            <div className="flex items-center justify-end gap-1 mt-auto">
              <button
                onClick={(e) => { e.stopPropagation(); router.push("/reports/tasks"); }}
                className="flex items-center gap-1 text-xs font-medium text-[#666] px-2 py-1.5 rounded-lg hover:bg-[#f1f1f1] transition-colors"
                title="View Report"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); exportTasksReportPdf(tasks, projects); }}
                className="flex items-center gap-1 border border-[#eaeaea] bg-white text-xs font-medium text-[#0a0a0a] px-2 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
                title="Download PDF"
              >
                <Download className="w-3.5 h-3.5" />
                PDF
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); exportTasksReportDocx(tasks, projects); }}
                className="flex items-center gap-1 border border-[#eaeaea] bg-white text-xs font-medium text-[#0a0a0a] px-2 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
                title="Download Word"
              >
                <FileType className="w-3.5 h-3.5" />
                Word
              </button>
            </div>
          </div>

          <div
            onClick={() => router.push("/reports/tickets")}
            className="flex flex-col h-full min-h-57.5 bg-white border border-[#eaeaea] rounded-xl p-5 cursor-pointer transition-all duration-150 hover:border-[#ccc] hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="bg-[#fef3c7] p-2.5 rounded-lg">
                <LifeBuoy className="w-4 h-4 text-[#b45309]" />
              </div>
            </div>
            <p className="text-sm font-semibold text-[#0a0a0a] mb-1">Ticket Resolution Report</p>
            <p className="text-xs text-[#666] leading-5 mb-4">
              {completedTicketsTotal} ticket{completedTicketsTotal !== 1 ? "s" : ""} resolved or closed
            </p>
            <div className="flex items-center justify-end gap-1 mt-auto">
              <button
                onClick={(e) => { e.stopPropagation(); router.push("/reports/tickets"); }}
                className="flex items-center gap-1 text-xs font-medium text-[#666] px-2 py-1.5 rounded-lg hover:bg-[#f1f1f1] transition-colors"
                title="View Report"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); exportTicketsReportPdf(tickets); }}
                className="flex items-center gap-1 border border-[#eaeaea] bg-white text-xs font-medium text-[#0a0a0a] px-2 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
                title="Download PDF"
              >
                <Download className="w-3.5 h-3.5" />
                PDF
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); exportTicketsReportDocx(tickets); }}
                className="flex items-center gap-1 border border-[#eaeaea] bg-white text-xs font-medium text-[#0a0a0a] px-2 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
                title="Download Word"
              >
                <FileType className="w-3.5 h-3.5" />
                Word
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
