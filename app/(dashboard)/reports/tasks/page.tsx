"use client";

import { useEffect, useState } from "react";
import ReportDocument from "@/components/reports/ReportDocument";
import TasksReportPreview from "@/components/reports/TasksReportPreview";
import { subscribeProjects } from "@/lib/db/projects";
import { subscribeTasks } from "@/lib/db/tasks";
import type { Project } from "@/lib/mock-projects";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";
import { exportTasksReportPdf } from "@/lib/reports/tasks-report-pdf";
import { exportTasksReportDocx } from "@/lib/reports/tasks-report-docx";

export default function TasksReportPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<KanbanCard[]>([]);

  useEffect(() => {
    const unsub = subscribeProjects(setProjects);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeTasks(setTasks);
    return unsub;
  }, []);

  return (
    <ReportDocument
      backHref="/reports"
      backLabel="Back to Reports"
      reportLabel="Completed Tasks Report"
      title="Completed Tasks Report"
      subtitle="A consolidated report of every completed task across all projects"
      onDownloadPdf={() => exportTasksReportPdf(tasks, projects)}
      onDownloadWord={() => exportTasksReportDocx(tasks, projects)}
    >
      <TasksReportPreview tasks={tasks} projects={projects} />
    </ReportDocument>
  );
}
