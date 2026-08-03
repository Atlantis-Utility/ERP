// This file contains only type definitions and UI config.
// All runtime data lives in Firestore — use lib/db/projects.ts to read/write.

import type { PhasesState } from "./project-phases";

export type ProjectStatus = "active" | "completed" | "on-hold" | "overdue" | "cancelled";
export type Priority = "high" | "medium" | "low";

export interface ProjectContact {
  name: string;
  designation: string;
  email: string;
  phone: string;
  isMain?: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  owner: string;
  team: string[];
  department: string;
  progress: number;
  deadline: string;
  priority: Priority;
  ispPrimary?: string;
  ispSecondary?: string;
  deadlineTbd?: boolean;
  /** @deprecated use ispPrimary */
  isp?: string;
  clientName?: string;
  clientLocation?: string;
  contacts?: ProjectContact[];
  /** @deprecated use contacts[] */
  clientContact?: string;
  /** @deprecated use contacts[] */
  clientPhone?: string;
  /** @deprecated use contacts[] */
  clientEmail?: string;
  phases?: PhasesState;
}

export const statusConfig: Record<ProjectStatus, { label: string; bg: string; text: string }> = {
  active:    { label: "Active",    bg: "bg-[#e8f2ff]", text: "text-[#0070f3]" },
  completed: { label: "Completed", bg: "bg-[#e8fdf0]", text: "text-[#17c964]" },
  "on-hold": { label: "On Hold",   bg: "bg-[#f1f1f1]", text: "text-[#666]"    },
  overdue:   { label: "Overdue",   bg: "bg-[#fff0f5]", text: "text-[#f31260]" },
  cancelled: { label: "Cancelled", bg: "bg-[#f1f1f1]", text: "text-[#999]"    },
};

export const priorityConfig: Record<Priority, { color: string; label: string }> = {
  high:   { color: "#f31260", label: "High"   },
  medium: { color: "#f5a524", label: "Medium" },
  low:    { color: "#17c964", label: "Low"    },
};

// Kept for legacy imports — real data is in Firestore
export const initialProjects: Project[] = [];
