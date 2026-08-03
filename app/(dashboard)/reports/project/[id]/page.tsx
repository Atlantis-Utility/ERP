"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ReportDocument from "@/components/reports/ReportDocument";
import ProjectReportPreview from "@/components/reports/ProjectReportPreview";
import { subscribeProjects } from "@/lib/db/projects";
import { subscribeTasks } from "@/lib/db/tasks";
import type { Project } from "@/lib/mock-projects";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";
import { exportProjectReportPdf } from "@/lib/reports/project-report-pdf";
import { exportProjectReportDocx } from "@/lib/reports/project-report-docx";

export default function ProjectReportPage() {
  const { id } = useParams<{ id: string }>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<KanbanCard[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsub = subscribeProjects((ps) => { setProjects(ps); setLoaded(true); });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeTasks(setTasks);
    return unsub;
  }, []);

  const project = projects.find((p) => p.id === id);

  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-[#999]">Loading report…</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-lg font-semibold text-[#0a0a0a] mb-2">Report not found</p>
        <p className="text-sm text-[#999]">This project may have been removed.</p>
      </div>
    );
  }

  return (
    <ReportDocument
      backHref="/reports"
      backLabel="Back to Reports"
      reportLabel="Project Completion Report"
      title={project.name}
      subtitle={project.description}
      onDownloadPdf={() => exportProjectReportPdf(project, tasks)}
      onDownloadWord={() => exportProjectReportDocx(project, tasks)}
    >
      <ProjectReportPreview project={project} tasks={tasks} />
    </ReportDocument>
  );
}
