// Shared, plain-data report shape consumed identically by the in-app preview,
// the PDF exporter, and the Word exporter — so narrative text is written once
// and the three views can never drift out of sync with each other.

import type { Project } from "@/lib/mock-projects";
import { statusConfig, priorityConfig } from "@/lib/mock-projects";
import { PHASE_DEFS } from "@/lib/project-phases";
import type { Attachment, PhasesState } from "@/lib/project-phases";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";
import { formatDate } from "@/lib/utils";
import { formatFileSize } from "@/lib/file-storage";

export interface ReportMetaRow {
  label: string;
  value: string;
}

export interface ReportPhaseSection {
  id: string;
  num: number;
  label: string;
  statusLabel: string;
  description: string;
  attachmentLines: string[];
}

export interface ReportContactRow {
  name: string;
  role: string;
  email: string;
  phone: string;
}

export interface ReportTaskRow {
  title: string;
  assignees: string[];
  priorityLabel: string;
  dueDate: string;
}

export interface ProjectReportData {
  generatedAt: string;
  project: {
    name: string;
    description: string;
    statusLabel: string;
    priorityLabel: string;
  };
  meta: ReportMetaRow[];
  progressPercent: number;
  phases: ReportPhaseSection[];
  team: string[];
  contacts: ReportContactRow[];
  tasksSummary: { completed: number; total: number };
  completedTasks: ReportTaskRow[];
  signOff: { role: string }[];
}

const phaseStatusLabel: Record<string, string> = {
  "not-started": "Not Started",
  "in-progress": "In Progress",
  completed: "Completed",
  blocked: "Blocked",
};

/** Turns any attachment into a single human-readable line — the one place this narrative text is written. */
export function describeAttachment(a: Attachment): string {
  switch (a.type) {
    case "contact":
      return [a.contactName, a.contactRole, a.contactEmail, a.contactPhone].filter(Boolean).join(" — ") || a.label;
    case "link":
      return [a.label, a.url].filter(Boolean).join(": ");
    case "media":
      return [a.label, a.url].filter(Boolean).join(": ");
    case "note":
      return [a.label && a.label !== "Untitled" ? a.label : null, a.content].filter(Boolean).join(" — ");
    case "file": {
      const details = [a.fileName, a.fileSize !== undefined ? formatFileSize(a.fileSize) : null].filter(Boolean).join(", ");
      return `${a.label}${details ? ` (${details})` : ""} — file not embedded, see original upload`;
    }
    default:
      return a.label;
  }
}

export function reportFileBaseName(project: Project): string {
  return project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") + "-report";
}

export function buildProjectReportData(project: Project, allTasks: KanbanCard[] = []): ProjectReportData {
  const phasesState: PhasesState = project.phases ?? {};

  const meta: ReportMetaRow[] = [
    { label: "Client", value: project.clientName || "—" },
    { label: "Location", value: project.clientLocation || "—" },
    { label: "Department", value: project.department || "—" },
    { label: "Owner", value: project.owner || "—" },
    { label: "Completion Date", value: project.deadlineTbd ? "TBD" : (project.deadline ? formatDate(project.deadline) : "—") },
    { label: "Priority", value: priorityConfig[project.priority]?.label ?? project.priority },
  ];
  const ispPrimary = project.ispPrimary ?? project.isp;
  if (ispPrimary) meta.push({ label: "Primary ISP", value: ispPrimary });
  if (project.ispSecondary) meta.push({ label: "Secondary ISP", value: project.ispSecondary });

  const phases: ReportPhaseSection[] = PHASE_DEFS.map((def) => {
    const phase = phasesState[def.id];
    const status = phase?.status ?? "not-started";
    return {
      id: def.id,
      num: def.num,
      label: def.label,
      statusLabel: phaseStatusLabel[status] ?? status,
      description: phase?.description?.trim() ?? "",
      attachmentLines: (phase?.attachments ?? []).map(describeAttachment),
    };
  });

  const team = [project.owner, ...project.team.filter((m) => m !== project.owner)].filter(Boolean);

  const contacts: ReportContactRow[] = (
    project.contacts && project.contacts.length > 0
      ? project.contacts
      : (project.clientContact || project.clientEmail || project.clientPhone)
        ? [{ name: project.clientContact ?? "", designation: "", email: project.clientEmail ?? "", phone: project.clientPhone ?? "" }]
        : []
  ).map((c) => ({ name: c.name || "—", role: c.designation || "—", email: c.email || "—", phone: c.phone || "—" }));

  const projectTasks = allTasks.filter((t) => t.type === "task" && t.projectId === project.id);
  const completedTasksRaw = projectTasks.filter((t) => t.column === "done");
  const completedTasks: ReportTaskRow[] = completedTasksRaw.map((t) => ({
    title: t.title,
    assignees: t.assignees,
    priorityLabel: priorityConfig[t.priority]?.label ?? t.priority,
    dueDate: t.dueDateTbd ? "TBD" : (t.dueDate ? formatDate(t.dueDate) : "—"),
  }));

  return {
    generatedAt: new Date().toISOString(),
    project: {
      name: project.name,
      description: project.description || "",
      statusLabel: statusConfig[project.status]?.label ?? project.status,
      priorityLabel: priorityConfig[project.priority]?.label ?? project.priority,
    },
    meta,
    progressPercent: project.progress,
    phases,
    team,
    contacts,
    tasksSummary: { completed: completedTasksRaw.length, total: projectTasks.length },
    completedTasks,
    signOff: [{ role: "Prepared by" }, { role: "Reviewed by" }, { role: "Approved by" }],
  };
}
