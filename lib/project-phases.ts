// Pure types/constants/helpers for the project-phases timeline. No React here —
// shared by the phases UI (components/projects/ProjectPhases.tsx) and the
// reports module (lib/reports/*) without either pulling in a client component.

import type { Project } from "./mock-projects";

export type PhaseStatus = "not-started" | "in-progress" | "completed" | "blocked";
export type AttachmentType = "link" | "file" | "contact" | "media" | "note";

export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string;
  url?: string;
  // stored file
  fileStorageId?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  // contact
  contactName?: string;
  contactRole?: string;
  contactEmail?: string;
  contactPhone?: string;
  // note / file notes
  content?: string;
  addedAt: string;
}

export interface PhaseData {
  status: PhaseStatus;
  description: string;
  attachments: Attachment[];
}

export type PhasesState = Record<string, PhaseData>;

export interface PhaseDef {
  id: string;
  num: number;
  label: string;
  hint: string;
}

export const PHASE_DEFS: PhaseDef[] = [
  {
    id: "poc", num: 1, label: "Point of Contact",
    hint: "Document the problem statement, stakeholder needs, initial requirements, and background context that originated this project.",
  },
  {
    id: "planning", num: 2, label: "Planning",
    hint: "Define the full scope, milestones, resource plan, timeline, dependencies, risks, and measurable success criteria.",
  },
  {
    id: "execution", num: 3, label: "Execution",
    hint: "Track active sprint work, blockers, key decisions, change requests, and deliverables as the team builds.",
  },
  {
    id: "deployment", num: 4, label: "Deployment",
    hint: "Document deployment steps, release notes, rollout strategy, go-live checklist, and stakeholder sign-offs.",
  },
  {
    id: "followup", num: 5, label: "Follow Up",
    hint: "Capture post-launch actions, client feedback, lessons learned, outstanding items, and handoff documentation.",
  },
  {
    id: "monitoring", num: 6, label: "Monitoring",
    hint: "Track ongoing metrics, SLA compliance, performance baselines, alert thresholds, and maintenance schedules.",
  },
];

export const defaultPhase = (): PhaseData => ({ status: "not-started", description: "", attachments: [] });

export function emptyPhasesState(): PhasesState {
  return Object.fromEntries(PHASE_DEFS.map((d) => [d.id, defaultPhase()]));
}

export function computeProgress(state: PhasesState): number {
  const total = PHASE_DEFS.length;
  const score = PHASE_DEFS.reduce((acc, d) => {
    const s = state[d.id]?.status ?? "not-started";
    return acc + (s === "completed" ? 1 : s === "in-progress" ? 0.5 : s === "blocked" ? 0.25 : 0);
  }, 0);
  return Math.round((score / total) * 100);
}

export function seedFromProject(project: Project): PhasesState {
  const pocAttachments: Attachment[] = [];

  // Prefer new contacts array, fall back to legacy single-contact fields
  const allContacts = project.contacts && project.contacts.length > 0
    ? project.contacts
    : (project.clientContact || project.clientEmail || project.clientPhone)
      ? [{ name: project.clientContact ?? "", designation: "", email: project.clientEmail ?? "", phone: project.clientPhone ?? "" }]
      : [];

  const clientRole = [project.clientName, project.clientLocation].filter(Boolean).join(" · ") || undefined;

  if (allContacts.length > 0) {
    allContacts.forEach((c, i) => {
      pocAttachments.push({
        id: `att-seed-${project.id}-${i}`,
        type: "contact",
        label: c.name || project.clientName || "Client",
        contactName: c.name || project.clientName || undefined,
        contactRole: [c.designation, clientRole].filter(Boolean).join(" · ") || undefined,
        contactEmail: c.email || undefined,
        contactPhone: c.phone || undefined,
        addedAt: new Date().toISOString(),
      });
    });
  } else if (project.clientName) {
    pocAttachments.push({
      id: `att-seed-${project.id}`,
      type: "contact",
      label: project.clientName,
      contactName: project.clientName,
      contactRole: project.clientLocation || undefined,
      addedAt: new Date().toISOString(),
    });
  }

  return Object.fromEntries(
    PHASE_DEFS.map((def, i) => {
      const lo = (i / PHASE_DEFS.length) * 100;
      const hi = ((i + 1) / PHASE_DEFS.length) * 100;
      const statusFromProgress: PhaseStatus =
        project.progress >= hi ? "completed" :
        project.progress >= lo ? "in-progress" :
        "not-started";

      if (def.id === "poc") {
        return [def.id, {
          status: project.progress >= 100 ? "completed" : "in-progress",
          description: project.description ?? "",
          attachments: pocAttachments,
        }];
      }

      return [def.id, { status: statusFromProgress, description: "", attachments: [] }];
    })
  );
}
