"use client";

import { useMemo } from "react";
import { Users, CheckSquare } from "lucide-react";
import type { Project } from "@/lib/mock-projects";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";
import { buildProjectReportData } from "@/lib/reports/project-report";
import { getAvatarColor, getInitials } from "@/lib/utils";

const phaseStatusStyle: Record<string, { bg: string; text: string }> = {
  "Not Started": { bg: "bg-[#f1f1f1]", text: "text-[#999]" },
  "In Progress": { bg: "bg-[#e8f2ff]", text: "text-[#0070f3]" },
  Completed: { bg: "bg-[#e8fdf0]", text: "text-[#17c964]" },
  Blocked: { bg: "bg-[#fff0f5]", text: "text-[#f31260]" },
};

export default function ProjectReportPreview({ project, tasks = [] }: { project: Project; tasks?: KanbanCard[] }) {
  const data = useMemo(() => buildProjectReportData(project, tasks), [project, tasks]);

  return (
    <div className="space-y-8">
      {/* Overview */}
      <div>
        <p className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2">Project Overview</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-[#fafafa] border border-[#eaeaea] rounded-lg p-4">
          {data.meta.map((row) => (
            <div key={row.label}>
              <p className="text-[10px] text-[#999] uppercase tracking-wide">{row.label}</p>
              <p className="text-sm text-[#0a0a0a] font-medium">{row.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Phases / timeline */}
      <div>
        <p className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2">Project Timeline</p>
        <div className="space-y-3">
          {data.phases.map((phase) => {
            const sc = phaseStatusStyle[phase.statusLabel] ?? phaseStatusStyle["Not Started"];
            return (
              <div key={phase.id} className="border border-[#eaeaea] rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-medium text-[#0a0a0a]">{phase.num}. {phase.label}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>{phase.statusLabel}</span>
                </div>
                <p className={`text-xs leading-relaxed ${phase.description ? "text-[#666]" : "text-[#ccc] italic"}`}>
                  {phase.description || "No notes recorded for this phase."}
                </p>
                {phase.attachmentLines.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {phase.attachmentLines.map((line, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-[#666]">
                        <span className="mt-1 w-1 h-1 rounded-full bg-[#bbb] shrink-0" />
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Completed tasks */}
      <div>
        <p className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <CheckSquare className="w-3.5 h-3.5" /> Completed Tasks
          <span className="normal-case font-normal text-[#bbb]">
            ({data.tasksSummary.completed} of {data.tasksSummary.total})
          </span>
        </p>
        {data.completedTasks.length > 0 ? (
          <div className="space-y-2">
            {data.completedTasks.map((t, i) => (
              <div key={i} className="border border-[#eaeaea] rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#0a0a0a] truncate">{t.title}</p>
                  <p className="text-xs text-[#999] mt-0.5">{t.assignees.join(", ") || "Unassigned"} · Due {t.dueDate}</p>
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#f1f1f1] text-[#666] shrink-0">{t.priorityLabel}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#ccc] italic">No completed tasks linked to this project.</p>
        )}
      </div>

      {/* Team */}
      <div>
        <p className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Team
        </p>
        <div className="flex flex-wrap gap-2">
          {data.team.map((name, i) => {
            const c = getAvatarColor(name);
            return (
              <div key={name} className="flex items-center gap-1.5 bg-[#fafafa] border border-[#eaeaea] rounded-full px-2 py-1">
                <div className={`w-5 h-5 rounded-full ${c.bg} ${c.text} flex items-center justify-center shrink-0`}>
                  <span className="text-[9px] font-semibold">{getInitials(name)}</span>
                </div>
                <span className="text-xs text-[#444]">{name}{i === 0 ? " (Owner)" : ""}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Client contacts */}
      <div>
        <p className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2">Client Contacts</p>
        {data.contacts.length > 0 ? (
          <div className="space-y-2">
            {data.contacts.map((c, i) => (
              <div key={i} className="border border-[#eaeaea] rounded-lg p-3">
                <p className="text-sm font-medium text-[#0a0a0a]">{c.name}</p>
                <p className="text-xs text-[#999]">{c.role}</p>
                <p className="text-xs text-[#0070f3] mt-1">{c.email} · {c.phone}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#ccc] italic">No client contacts recorded.</p>
        )}
      </div>

      {/* Sign-off */}
      <div>
        <p className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2">Sign-off</p>
        <div className="space-y-3">
          {data.signOff.map((row) => (
            <div key={row.role} className="flex items-center gap-3 text-xs text-[#666]">
              <span className="w-24 shrink-0">{row.role}:</span>
              <span className="flex-1 border-b border-dashed border-[#ccc] h-4" />
              <span className="shrink-0">Date:</span>
              <span className="w-24 border-b border-dashed border-[#ccc] h-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
