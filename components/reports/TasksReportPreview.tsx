"use client";

import { useMemo } from "react";
import type { Project } from "@/lib/mock-projects";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";
import { buildTasksReportData } from "@/lib/reports/tasks-report";

export default function TasksReportPreview({ tasks, projects }: { tasks: KanbanCard[]; projects: Project[] }) {
  const data = useMemo(() => buildTasksReportData(tasks, projects), [tasks, projects]);

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#fafafa] border border-[#eaeaea] rounded-lg p-3 text-center">
          <p className="text-xl font-semibold text-[#0a0a0a]">{data.summary.totalCompleted}</p>
          <p className="text-[10px] text-[#999] uppercase tracking-wide mt-0.5">Completed</p>
        </div>
        <div className="bg-[#fafafa] border border-[#eaeaea] rounded-lg p-3 text-center">
          <p className="text-xl font-semibold text-[#0a0a0a]">{data.summary.projectsTouched}</p>
          <p className="text-[10px] text-[#999] uppercase tracking-wide mt-0.5">Projects</p>
        </div>
        <div className="bg-[#fafafa] border border-[#eaeaea] rounded-lg p-3 text-center">
          <p className="text-xl font-semibold text-[#0a0a0a]">{data.summary.contributors}</p>
          <p className="text-[10px] text-[#999] uppercase tracking-wide mt-0.5">Contributors</p>
        </div>
      </div>

      {/* Task list */}
      <div>
        <p className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2">Completed Tasks</p>
        {data.tasks.length > 0 ? (
          <div className="space-y-2">
            {data.tasks.map((t, i) => (
              <div key={i} className="border border-[#eaeaea] rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#0a0a0a] truncate">{t.title}</p>
                  <p className="text-xs text-[#999] mt-0.5">
                    {t.projectName} · {t.assignees.join(", ") || "Unassigned"} · Due {t.dueDate}
                  </p>
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#f1f1f1] text-[#666] shrink-0">{t.priorityLabel}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#ccc] italic">No completed tasks recorded yet.</p>
        )}
      </div>
    </div>
  );
}
