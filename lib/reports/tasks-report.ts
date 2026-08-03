// Shared, plain-data shape for the consolidated "Completed Tasks" report —
// consumed identically by the in-app preview, PDF exporter, and Word exporter.

import type { Project } from "@/lib/mock-projects";
import { priorityConfig } from "@/lib/mock-projects";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";
import { formatDate } from "@/lib/utils";

export interface ReportTaskEntry {
  title: string;
  projectName: string;
  assignees: string[];
  priorityLabel: string;
  dueDate: string;
}

export interface TasksReportData {
  generatedAt: string;
  summary: { totalCompleted: number; projectsTouched: number; contributors: number };
  tasks: ReportTaskEntry[];
}

export const TASKS_REPORT_FILE_BASE_NAME = "completed-tasks-report";

export function buildTasksReportData(allTasks: KanbanCard[], projects: Project[]): TasksReportData {
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  const completed = allTasks.filter((t) => t.type === "task" && t.column === "done");

  const tasks: ReportTaskEntry[] = completed
    .map((t) => ({
      title: t.title,
      projectName: (t.projectId && projectNameById.get(t.projectId)) || "—",
      assignees: t.assignees,
      priorityLabel: priorityConfig[t.priority]?.label ?? t.priority,
      dueDate: t.dueDateTbd ? "TBD" : (t.dueDate ? formatDate(t.dueDate) : "—"),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const projectsTouched = new Set(completed.map((t) => t.projectId).filter(Boolean)).size;
  const contributors = new Set(completed.flatMap((t) => t.assignees)).size;

  return {
    generatedAt: new Date().toISOString(),
    summary: { totalCompleted: completed.length, projectsTouched, contributors },
    tasks,
  };
}
