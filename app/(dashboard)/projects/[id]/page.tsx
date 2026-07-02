"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { statusConfig, priorityConfig } from "@/lib/mock-projects";
import type { Project, ProjectContact } from "@/lib/mock-projects";
import { useEmployees } from "@/lib/db/employees";
import { updateProject } from "@/lib/db/projects";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAvatarColor, getInitials, formatDate } from "@/lib/utils";
import Drawer from "@/components/ui/Drawer";
import FormField, { inputClass, selectClass } from "@/components/ui/FormField";
import DateTimePicker from "@/components/ui/DateTimePicker";
import ProjectPhases from "@/components/projects/ProjectPhases";
import type { PhasesState } from "@/components/projects/ProjectPhases";
import { PHASE_DEFS } from "@/components/projects/ProjectPhases";
import { ArrowLeft, Building2, Mail, Phone, MapPin, Users, CalendarDays, BarChart3, Pencil, Wifi, ExternalLink, Check } from "lucide-react";
import { addNotification } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

function daysUntil(deadline: string): number {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
}

const emptyEdit = (p: Project) => ({
  name: p.name,
  description: p.description,
  status: p.status,
  priority: p.priority,
  owner: p.owner,
  deadline: p.deadline ?? "",
  deadlineTbd: p.deadlineTbd ?? false,
  ispPrimary: p.ispPrimary ?? p.isp ?? "",
  ispSecondary: p.ispSecondary ?? "",
  team: [...p.team],
  clientName: p.clientName ?? "",
  clientLocation: p.clientLocation ?? "",
  // Migrate from legacy single-contact fields if new array not present
  contacts: p.contacts && p.contacts.length > 0
    ? p.contacts.map((c, i) => ({ name: c.name, designation: c.designation ?? "", email: c.email, phone: c.phone, isMain: c.isMain ?? (i === 0) }))
    : (p.clientContact || p.clientEmail || p.clientPhone)
      ? [{ name: p.clientContact ?? "", designation: "", email: p.clientEmail ?? "", phone: p.clientPhone ?? "", isMain: true }]
      : [{ name: "", designation: "", email: "", phone: "", isMain: true }],
});

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [isAdmin, setIsAdmin] = useState(false);
  const [project, setProject] = useState<Project | null | undefined>(undefined); // undefined = loading
  const [computedProgress, setComputedProgress] = useState(0);
  const [phaseStatuses, setPhaseStatuses] = useState<PhasesState | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<ReturnType<typeof emptyEdit> | null>(null);
  const employees = useEmployees();

  useEffect(() => {
    setIsAdmin(!localStorage.getItem("current_user_id"));
    const unsub = onSnapshot(doc(db, "projects", id), (snap) => {
      if (snap.exists()) {
        const p = snap.data() as Project;
        setProject(p);
        setComputedProgress(p.progress);
      } else {
        setProject(null);
      }
    });
    return unsub;
  }, [id]);

  function handleProgressChange(p: number) {
    setComputedProgress(p);
    if (project) {
      updateProject(id, { progress: p }).catch(console.error);
    }
  }

  function openEdit() {
    if (!project) return;
    setForm(emptyEdit(project));
    setEditOpen(true);
  }

  function setField<K extends keyof ReturnType<typeof emptyEdit>>(
    key: K,
    value: ReturnType<typeof emptyEdit>[K]
  ) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleTeam(name: string) {
    if (!form) return;
    setField(
      "team",
      form.team.includes(name)
        ? form.team.filter((n) => n !== name)
        : [...form.team, name]
    );
  }

  function addContact() {
    setForm((prev) => prev ? { ...prev, contacts: [...prev.contacts, { name: "", designation: "", email: "", phone: "", isMain: false }] } : prev);
  }

  function removeContact(i: number) {
    setForm((prev) => {
      if (!prev) return prev;
      const isRemovingMain = prev.contacts[i]?.isMain;
      const filtered = prev.contacts.filter((_, idx) => idx !== i);
      if (isRemovingMain && filtered.length > 0) filtered[0] = { ...filtered[0], isMain: true };
      return { ...prev, contacts: filtered };
    });
  }

  function setMainContact(i: number) {
    setForm((prev) => prev ? {
      ...prev,
      contacts: prev.contacts.map((c, idx) => ({ ...c, isMain: idx === i })),
    } : prev);
  }

  function updateContact(i: number, field: keyof ProjectContact, value: string) {
    setForm((prev) => {
      if (!prev) return prev;
      const contacts = prev.contacts.map((c, idx) => idx === i ? { ...c, [field]: value } : c);
      return { ...prev, contacts };
    });
  }

  function handleSave() {
    if (!form || !project) return;
    const filteredContacts = form.contacts.filter(
      (c) => c.name.trim() || c.designation.trim() || c.email.trim() || c.phone.trim()
    );
    const updated: Project = {
      ...project,
      ...form,
      progress: computedProgress,
      deadline: form.deadlineTbd ? "" : form.deadline,
      deadlineTbd: form.deadlineTbd || undefined,
      ispPrimary: form.ispPrimary.trim() || undefined,
      ispSecondary: form.ispSecondary.trim() || undefined,
      isp: undefined,
      clientName: form.clientName.trim() || undefined,
      clientLocation: form.clientLocation.trim() || undefined,
      contacts: filteredContacts.length > 0 ? filteredContacts : undefined,
      clientContact: undefined,
      clientPhone: undefined,
      clientEmail: undefined,
    };
    // Track changed fields for a rich log entry
    const changes: string[] = [];
    if (form.name !== project.name)             changes.push(`name → "${form.name}"`);
    if (form.status !== project.status)         changes.push(`status: ${project.status} → ${form.status}`);
    if (form.priority !== project.priority)     changes.push(`priority: ${project.priority} → ${form.priority}`);
    if (form.owner !== project.owner)           changes.push(`owner: ${project.owner} → ${form.owner}`);
    if (form.deadline !== project.deadline)     changes.push(`deadline → ${form.deadline}`);
    if (form.ispPrimary !== (project.ispPrimary ?? project.isp ?? "")) changes.push(`primary ISP → ${form.ispPrimary}`);
    if (form.ispSecondary !== (project.ispSecondary ?? ""))            changes.push(`secondary ISP → ${form.ispSecondary}`);

    if (form.status !== project.status) {
      addNotification({
        prefId: "n-2",
        icon: "project",
        title: "Project status changed",
        body: `"${project.name}" → ${form.status.replace("-", " ")}`,
        href: `/projects/${id}`,
      });
    }

    logActivity({
      category: "projects",
      action: "Project updated",
      detail: changes.length > 0
        ? `Updated "${project.name}": ${changes.join("; ")}`
        : `Edited project "${project.name}" (no field changes detected)`,
      metadata: { projectId: id, status: form.status },
    });

    updateProject(id, updated).catch(console.error);
    setEditOpen(false);
  }

  if (project === undefined) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-[#999]">Loading project…</p>
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-lg font-semibold text-[#0a0a0a] mb-2">Project not found</p>
        <Link href="/projects" className="flex items-center gap-2 text-sm text-[#0070f3] hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </Link>
      </div>
    );
  }

  const st = statusConfig[project.status];
  const pr = priorityConfig[project.priority];
  const days = project.deadlineTbd ? 0 : daysUntil(project.deadline);
  const isOverdue = !project.deadlineTbd && (project.status === "overdue" || (days < 0 && project.status !== "completed"));


  return (
    <div>
      {/* Back */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-2 text-sm text-[#666] hover:text-[#0a0a0a] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Projects
      </Link>

      {/* Header card */}
      <div className="bg-white border border-[#eaeaea] rounded-xl p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-[#0a0a0a] leading-tight mb-2">{project.name}</h1>
            <p className="text-sm text-[#666] leading-relaxed">{project.description}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${st.bg} ${st.text}`}>
              {st.label}
            </span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-[#444] bg-[#f7f7f7] px-3 py-1 rounded-full border border-[#eaeaea]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: pr.color }} />
              {pr.label} Priority
            </span>
            {isAdmin && (
              <button
                onClick={openEdit}
                className="flex items-center gap-1.5 text-sm font-medium bg-[#0a0a0a] text-white px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Phase chips strip */}
        <div className="border-t border-[#f1f1f1] pt-4">
          <div className="flex flex-wrap gap-2">
            {PHASE_DEFS.map((def) => {
              const status = phaseStatuses?.[def.id]?.status ?? "not-started";
              const dotColor =
                status === "completed"   ? "#17c964" :
                status === "in-progress" ? "#0070f3" :
                status === "blocked"     ? "#f31260" :
                "#ddd";
              const textColor =
                status === "completed"   ? "#17c964" :
                status === "in-progress" ? "#0070f3" :
                status === "blocked"     ? "#f31260" :
                "#bbb";
              return (
                <div
                  key={def.id}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[#eaeaea] bg-[#fafafa]"
                  style={{ color: textColor }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: dotColor }}
                  />
                  {def.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — phases + team */}
        <div className="lg:col-span-2 space-y-5">

          {/* Phase management */}
          <ProjectPhases
            projectId={project.id}
            initialProject={project}
            onProgressChange={handleProgressChange}
            onPhasesChange={setPhaseStatuses}
          />

          {/* Team */}
          <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-[#0a0a0a]">Team</p>
              <span className="text-xs text-[#999]">
                {project.team.length} member{project.team.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-2.5">
              {[project.owner, ...project.team.filter((m) => m !== project.owner)].map((name, i) => {
                const c = getAvatarColor(name);
                return (
                  <div key={name} className="flex items-center gap-3 py-1">
                    <div className={`w-8 h-8 rounded-full ${c.bg} ${c.text} flex items-center justify-center shrink-0`}>
                      <span className="text-xs font-semibold">{getInitials(name)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0a0a0a]">{name}</p>
                      <p className="text-[11px] text-[#999]">{i === 0 ? "Owner" : "Member"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-1 space-y-5">

          {/* Project details */}
          <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
            <p className="text-sm font-semibold text-[#0a0a0a] mb-4">Details</p>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-[#999] uppercase tracking-wider mb-1.5">Assigned To</p>
                <div className="flex flex-wrap gap-1.5">
                  {project.team.map((name) => {
                    const c = getAvatarColor(name);
                    return (
                      <div key={name} className="flex items-center gap-1.5 bg-[#fafafa] border border-[#eaeaea] rounded-full px-2 py-1">
                        <div className={`w-4 h-4 rounded-full ${c.bg} ${c.text} flex items-center justify-center shrink-0`}>
                          <span className="text-[8px] font-semibold">{getInitials(name)}</span>
                        </div>
                        <span className="text-xs text-[#444]">{name.split(" ")[0]}</span>
                      </div>
                    );
                  })}
                  {project.team.length === 0 && <span className="text-sm text-[#ccc]">-</span>}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-[#999] uppercase tracking-wider mb-1">Owner</p>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full ${getAvatarColor(project.owner).bg} ${getAvatarColor(project.owner).text} flex items-center justify-center shrink-0`}>
                    <span className="text-[9px] font-semibold">{getInitials(project.owner)}</span>
                  </div>
                  <p className="text-sm font-medium text-[#0a0a0a]">{project.owner}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-[#999] uppercase tracking-wider mb-1">Deadline</p>
                {project.deadlineTbd ? (
                  <p className="text-sm font-medium text-[#999]">To be decided</p>
                ) : (
                  <p className={`text-sm font-medium ${isOverdue ? "text-[#f31260]" : "text-[#0a0a0a]"}`}>
                    {formatDate(project.deadline)}
                    {isOverdue ? (
                      <span className="ml-1.5 text-[11px] font-semibold text-[#f31260]">({Math.abs(days)}d overdue)</span>
                    ) : project.status !== "completed" && days <= 30 ? (
                      <span className="ml-1.5 text-[11px] text-[#f5a524]">({days}d left)</span>
                    ) : null}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[10px] text-[#999] uppercase tracking-wider mb-1">Status</p>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${st.bg} ${st.text}`}>
                  {st.label}
                </span>
              </div>
              {(project.ispPrimary ?? project.isp) && (
                <div>
                  <p className="text-[10px] text-[#999] uppercase tracking-wider mb-2">ISP</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Wifi className="w-3.5 h-3.5 text-[#0070f3] shrink-0" />
                      <p className="text-sm font-medium text-[#0a0a0a]">{project.ispPrimary ?? project.isp}</p>
                      <span className="text-[9px] font-semibold text-[#0070f3] bg-[#e8f2ff] px-1.5 py-0.5 rounded-full uppercase tracking-wide">Primary</span>
                    </div>
                    {project.ispSecondary && (
                      <div className="flex items-center gap-1.5">
                        <Wifi className="w-3.5 h-3.5 text-[#999] shrink-0" />
                        <p className="text-sm font-medium text-[#444]">{project.ispSecondary}</p>
                        <span className="text-[9px] font-semibold text-[#666] bg-[#f1f1f1] px-1.5 py-0.5 rounded-full uppercase tracking-wide">Secondary</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick stats */}
          <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
            <p className="text-sm font-semibold text-[#0a0a0a] mb-4">Quick Stats</p>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg shrink-0">
                  <BarChart3 className="w-3.5 h-3.5 text-[#0070f3]" />
                </div>
                <div>
                  <p className="text-[10px] text-[#999] uppercase tracking-wider mb-0.5">Progress</p>
                  <p className="text-sm font-semibold text-[#0a0a0a]">{computedProgress}%</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg shrink-0">
                  <CalendarDays className={`w-3.5 h-3.5 ${isOverdue ? "text-[#f31260]" : "text-[#f5a524]"}`} />
                </div>
                <div>
                  <p className="text-[10px] text-[#999] uppercase tracking-wider mb-0.5">
                    {project.deadlineTbd ? "Deadline" : project.status === "completed" ? "Completed" : isOverdue ? "Overdue By" : "Days Left"}
                  </p>
                  <p className={`text-sm font-semibold ${isOverdue ? "text-[#f31260]" : project.deadlineTbd ? "text-[#999]" : "text-[#0a0a0a]"}`}>
                    {project.deadlineTbd ? "TBD" : project.status === "completed" ? formatDate(project.deadline) : `${Math.abs(days)} days`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg shrink-0">
                  <Users className="w-3.5 h-3.5 text-[#7c3aed]" />
                </div>
                <div>
                  <p className="text-[10px] text-[#999] uppercase tracking-wider mb-0.5">Team Size</p>
                  <p className="text-sm font-semibold text-[#0a0a0a]">{project.team.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Client info */}
          {project.clientName && (
            <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
              <p className="text-sm font-semibold text-[#0a0a0a] mb-4">Client</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg shrink-0 mt-0.5">
                    <Building2 className="w-3.5 h-3.5 text-[#0070f3]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0a0a0a]">{project.clientName}</p>
                  </div>
                </div>
                {project.clientLocation && (
                  <div className="flex items-center gap-3">
                    <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg shrink-0">
                      <MapPin className="w-3.5 h-3.5 text-[#999]" />
                    </div>
                    <div className="min-w-0 flex items-center justify-between gap-2 flex-1">
                      <p className="text-sm text-[#666]">{project.clientLocation}</p>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.clientLocation)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium border border-[#eaeaea] text-[#444] px-2.5 py-1.5 rounded-lg hover:bg-[#f5f5f5] hover:border-[#d4d4d4] transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Maps
                      </a>
                    </div>
                  </div>
                )}
                {/* Contacts — prefer new array, fall back to legacy single-contact fields */}
                {(project.contacts && project.contacts.length > 0
                  ? project.contacts
                  : (project.clientContact || project.clientEmail || project.clientPhone)
                    ? [{ name: project.clientContact ?? "", designation: "", email: project.clientEmail ?? "", phone: project.clientPhone ?? "" }]
                    : []
                ).map((contact, i) => (
                  <div key={i} className="border border-[#f4f4f4] rounded-lg p-3 space-y-2">
                    {(contact.name || contact.designation) && (
                      <div>
                        <div className="flex items-center gap-1.5">
                          {contact.name && (
                            <p className="text-xs font-semibold text-[#0a0a0a]">{contact.name}</p>
                          )}
                          {contact.isMain && (
                            <span className="text-[9px] font-semibold text-[#0070f3] bg-[#e8f2ff] px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">Main</span>
                          )}
                        </div>
                        {contact.designation && (
                          <p className="text-[11px] text-[#999] mt-0.5">{contact.designation}</p>
                        )}
                      </div>
                    )}
                    {contact.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3 h-3 text-[#999] shrink-0" />
                        <a href={`mailto:${contact.email}`} className="text-xs text-[#0070f3] hover:underline truncate">
                          {contact.email}
                        </a>
                      </div>
                    )}
                    {contact.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3 h-3 text-[#999] shrink-0" />
                        <a href={`tel:${contact.phone}`} className="text-xs text-[#444] hover:text-[#0070f3] transition-colors">
                          {contact.phone}
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Drawer */}
      {form && (
        <Drawer
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title="Edit Project"
          subtitle="Update project details and team"
          width="lg"
          footer={
            <>
              <button
                onClick={() => setEditOpen(false)}
                className="border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="bg-[#0a0a0a] text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-[#333] transition-colors"
              >
                Save Changes
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">Project Details</p>

            <FormField label="Project Name" required>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </FormField>

            <FormField label="Description">
              <textarea
                className={`${inputClass} resize-none`}
                rows={3}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Status">
                <select
                  className={selectClass}
                  value={form.status}
                  onChange={(e) => setField("status", e.target.value as Project["status"])}
                >
                  <option value="active">Active</option>
                  <option value="on-hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="overdue">Overdue</option>
                </select>
              </FormField>
              <FormField label="Priority">
                <select
                  className={selectClass}
                  value={form.priority}
                  onChange={(e) => setField("priority", e.target.value as Project["priority"])}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Primary ISP" required>
                <input
                  className={inputClass}
                  placeholder="e.g. Comcast"
                  value={form.ispPrimary}
                  onChange={(e) => setField("ispPrimary", e.target.value)}
                />
              </FormField>
              <FormField label="Secondary ISP">
                <input
                  className={inputClass}
                  placeholder="e.g. AT&T"
                  value={form.ispSecondary}
                  onChange={(e) => setField("ispSecondary", e.target.value)}
                />
              </FormField>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-[#444]">
                  Deadline
                  {!form.deadlineTbd && <span className="text-[#f31260] ml-0.5">*</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setField("deadlineTbd", !form.deadlineTbd)}
                  className="flex items-center gap-1.5 text-[10px] text-[#999] hover:text-[#555] transition-colors select-none"
                >
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                    form.deadlineTbd
                      ? "bg-[#0a0a0a] border-[#0a0a0a]"
                      : "border-[#d4d4d4] hover:border-[#999]"
                  }`}>
                    {form.deadlineTbd && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  To be decided
                </button>
              </div>
              {form.deadlineTbd ? (
                <div className="flex items-center h-9 px-3 rounded-lg border border-dashed border-[#e0e0e0] bg-[#fafafa] text-sm text-[#bbb]">
                  Will be set later
                </div>
              ) : (
                <DateTimePicker
                  value={form.deadline}
                  onChange={(v) => setField("deadline", v)}
                  placeholder="Pick a date & time"
                />
              )}
            </div>

            <div className="border-t border-[#f7f7f7] pt-4">
              <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">Ownership</p>
            </div>

            <FormField label="Owner" required>
              <select className={selectClass} value={form.owner} onChange={(e) => setField("owner", e.target.value)}>
                {employees.map((e) => (
                  <option key={e.id} value={e.name}>{e.name}</option>
                ))}
              </select>
            </FormField>

            <div className="border-t border-[#f7f7f7] pt-4">
              <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">
                Client / Company
                <span className="ml-2 normal-case font-normal text-[#999]">Optional</span>
              </p>
            </div>

            <FormField label="Company Name">
              <input className={inputClass} value={form.clientName} onChange={(e) => setField("clientName", e.target.value)} />
            </FormField>
            <FormField label="Location">
              <input className={inputClass} value={form.clientLocation} onChange={(e) => setField("clientLocation", e.target.value)} />
            </FormField>
            <div>
              <p className="text-[10px] font-medium text-[#999] mb-2 uppercase tracking-wider">Points of Contact</p>
              <div className="space-y-3">
                {form.contacts.map((contact, i) => (
                  <div key={i} className="border border-[#eaeaea] rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-[#444]">Contact {i + 1}</p>
                        {contact.isMain && form.contacts.length > 1 && (
                          <span className="text-[9px] font-semibold text-[#0070f3] bg-[#e8f2ff] px-1.5 py-0.5 rounded-full uppercase tracking-wide">Main</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {form.contacts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setMainContact(i)}
                            className={`flex items-center gap-1.5 text-[10px] transition-colors select-none ${contact.isMain ? "text-[#0070f3]" : "text-[#999] hover:text-[#555]"}`}
                          >
                            <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${contact.isMain ? "border-[#0070f3]" : "border-[#d4d4d4] hover:border-[#999]"}`}>
                              {contact.isMain && <div className="w-1.5 h-1.5 rounded-full bg-[#0070f3]" />}
                            </div>
                            Main
                          </button>
                        )}
                        {form.contacts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeContact(i)}
                            className="text-[10px] text-[#f31260] hover:text-[#d00050] transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField label="Full Name">
                        <input
                          className={inputClass}
                          placeholder="e.g. Jane Smith"
                          value={contact.name ?? ""}
                          onChange={(e) => updateContact(i, "name", e.target.value)}
                        />
                      </FormField>
                      <FormField label="Designation">
                        <input
                          className={inputClass}
                          placeholder="e.g. IT Manager"
                          value={contact.designation ?? ""}
                          onChange={(e) => updateContact(i, "designation", e.target.value)}
                        />
                      </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField label="Phone">
                        <input
                          className={inputClass}
                          type="tel"
                          placeholder="+1 (555) 000-0000"
                          value={contact.phone ?? ""}
                          onChange={(e) => updateContact(i, "phone", e.target.value)}
                        />
                      </FormField>
                      <FormField label="Email">
                        <input
                          className={inputClass}
                          type="email"
                          placeholder="name@company.com"
                          value={contact.email ?? ""}
                          onChange={(e) => updateContact(i, "email", e.target.value)}
                        />
                      </FormField>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addContact}
                  className="w-full text-sm text-[#0070f3] border border-dashed border-[#0070f3]/40 rounded-lg py-2 hover:bg-[#eff6ff] transition-colors"
                >
                  + Add another contact
                </button>
              </div>
            </div>

            <div className="border-t border-[#f7f7f7] pt-4">
              <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">
                Team Members
                {form.team.length > 0 && (
                  <span className="ml-2 normal-case font-normal text-[#0070f3]">{form.team.length} selected</span>
                )}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {employees.map((emp) => {
                const selected = form.team.includes(emp.name);
                const colors = getAvatarColor(emp.name);
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => toggleTeam(emp.name)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      selected
                        ? "border-[#0070f3] bg-[#e8f2ff]"
                        : "border-[#eaeaea] hover:border-[#ccc] hover:bg-[#fafafa]"
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full ${selected ? "bg-[#0070f3]" : colors.bg} ${selected ? "text-white" : colors.text} flex items-center justify-center shrink-0`}
                    >
                      <span className="text-[10px] font-semibold">{getInitials(emp.name)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-medium truncate ${selected ? "text-[#0070f3]" : "text-[#0a0a0a]"}`}>
                        {emp.name}
                      </p>
                      <p className="text-[10px] text-[#999] truncate">{emp.department}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
