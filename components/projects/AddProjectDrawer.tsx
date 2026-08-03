"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import Drawer from "@/components/ui/Drawer";
import FormField, { inputClass } from "@/components/ui/FormField";
import Select from "@/components/ui/Select";
import { useEmployees } from "@/lib/db/employees";
import { getAvatarColor, getInitials } from "@/lib/utils";
import type { Project, ProjectContact } from "@/lib/mock-projects";
import { PHASE_DEFS } from "@/components/projects/ProjectPhases";
import type { PhaseData, PhasesState, Attachment } from "@/components/projects/ProjectPhases";
import { logActivity } from "@/lib/activity-log";
import { addProject } from "@/lib/db/projects";
import DateTimePicker from "@/components/ui/DateTimePicker";

export type { Project };

interface Props {
  open: boolean;
  onClose: () => void;
}

const emptyContact: ProjectContact = { name: "", designation: "", email: "", phone: "", isMain: false };

const emptyForm = {
  name: "",
  description: "",
  status: "active" as Project["status"],
  priority: "medium" as Project["priority"],
  owner: "",
  deadline: "",
  deadlineTbd: false,
  ispPrimary: "",
  ispSecondary: "",
  team: [] as string[],
  clientName: "",
  clientLocation: "",
  contacts: [{ name: "", designation: "", email: "", phone: "", isMain: true }] as ProjectContact[],
};

type FormErrors = Partial<Record<keyof typeof emptyForm, string>>;

export default function AddProjectDrawer({ open, onClose }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const employees = useEmployees();

  function set<K extends keyof typeof emptyForm>(field: K, value: typeof emptyForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function addContact() {
    setForm((prev) => ({ ...prev, contacts: [...prev.contacts, { ...emptyContact }] }));
  }

  function removeContact(i: number) {
    setForm((prev) => {
      const isRemovingMain = prev.contacts[i]?.isMain;
      const filtered = prev.contacts.filter((_, idx) => idx !== i);
      if (isRemovingMain && filtered.length > 0) filtered[0] = { ...filtered[0], isMain: true };
      return { ...prev, contacts: filtered };
    });
  }

  function setMainContact(i: number) {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, idx) => ({ ...c, isMain: idx === i })),
    }));
  }

  function updateContact(i: number, field: keyof ProjectContact, value: string) {
    setForm((prev) => {
      const contacts = prev.contacts.map((c, idx) => idx === i ? { ...c, [field]: value } : c);
      return { ...prev, contacts };
    });
  }

  function toggleTeam(name: string) {
    set("team", form.team.includes(name)
      ? form.team.filter((n) => n !== name)
      : [...form.team, name]
    );
  }

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!form.name.trim()) errs.name = "Project name is required";
    if (!form.ispPrimary.trim()) errs.ispPrimary = "Primary ISP is required";
    if (!form.owner) errs.owner = "Owner is required";
    if (!form.deadlineTbd && !form.deadline) errs.deadline = "Set a deadline or mark as To be decided";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSaving(true);
    const id = `p-${Date.now()}`;
    const filteredContacts = form.contacts.filter(
      (c) => c.name.trim() || c.designation.trim() || c.email.trim() || c.phone.trim()
    );
    const newProject: Project = {
      id,
      name: form.name.trim(),
      description: form.description.trim(),
      status: form.status,
      priority: form.priority,
      owner: form.owner,
      department: "",
      deadline: form.deadlineTbd ? "" : form.deadline,
      deadlineTbd: form.deadlineTbd || undefined,
      ispPrimary: form.ispPrimary.trim(),
      ispSecondary: form.ispSecondary.trim() || undefined,
      team: form.team,
      progress: 0,
      clientName: form.clientName.trim() || undefined,
      clientLocation: form.clientLocation.trim() || undefined,
      contacts: filteredContacts.length > 0 ? filteredContacts : undefined,
    };

    // Seed Point of Contact phase with the project's details
    const pocAttachments: Attachment[] = [];

    // Add each contact as a contact attachment
    filteredContacts.forEach((contact, i) => {
      pocAttachments.push({
        id: `att-${Date.now()}-contact-${i}`,
        type: "contact",
        label: contact.name.trim() || `Contact ${i + 1}`,
        contactName: contact.name.trim() || undefined,
        contactRole: form.clientName.trim() ? `${form.clientName.trim()}${form.clientLocation.trim() ? ` · ${form.clientLocation.trim()}` : ""}` : undefined,
        contactEmail: contact.email.trim() || undefined,
        contactPhone: contact.phone.trim() || undefined,
        addedAt: new Date().toISOString(),
      });
    });

    // If no contacts but client name given, seed from company info
    if (pocAttachments.length === 0 && form.clientName.trim()) {
      pocAttachments.push({
        id: `att-${Date.now()}-client`,
        type: "contact",
        label: form.clientName.trim(),
        contactName: form.clientName.trim(),
        contactRole: form.clientLocation.trim() || undefined,
        addedAt: new Date().toISOString(),
      });
    }

    const pocPhase: PhaseData = {
      status: "in-progress",
      description: form.description.trim(),
      attachments: pocAttachments,
    };

    const initialPhases: PhasesState = Object.fromEntries(
      PHASE_DEFS.map((d) => [d.id, d.id === "poc" ? pocPhase : { status: "not-started", description: "", attachments: [] }])
    );
    localStorage.setItem(`project_phases_${id}`, JSON.stringify(initialPhases));

    try {
      await addProject(newProject);
      logActivity({
        category: "projects",
        action: "Project created",
        detail: `Created project "${newProject.name}" (${newProject.status}, ${newProject.priority} priority) owned by ${newProject.owner}`,
        metadata: { projectId: id, status: newProject.status, priority: newProject.priority },
      });
      setForm(emptyForm);
      setErrors({});
      onClose();
    } catch (err) {
      console.error("[AddProjectDrawer] Failed to add project:", err);
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setForm(emptyForm);
    setErrors({});
    onClose();
  }

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="New Project"
      subtitle="Set up a new project for your team"
      width="lg"
      footer={
        <>
          <button
            onClick={handleClose}
            className="border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-[#0a0a0a] text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Create Project"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">Project Details</p>

        <FormField label="Project Name" required error={errors.name}>
          <input
            className={inputClass}
            placeholder="e.g. Q4 Platform Migration"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </FormField>

        <FormField label="Description" hint="Brief overview of the project goals">
          <textarea
            className={`${inputClass} resize-none`}
            rows={3}
            placeholder="Describe the project scope and objectives..."
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Primary ISP" required error={errors.ispPrimary}>
            <input
              className={inputClass}
              placeholder="e.g. Comcast"
              value={form.ispPrimary}
              onChange={(e) => set("ispPrimary", e.target.value)}
            />
          </FormField>
          <FormField label="Secondary ISP">
            <input
              className={inputClass}
              placeholder="e.g. AT&T"
              value={form.ispSecondary}
              onChange={(e) => set("ispSecondary", e.target.value)}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Status" error={errors.status}>
            <Select
              value={form.status}
              onChange={(v) => set("status", v as Project["status"])}
              options={[
                { value: "active", label: "Active" },
                { value: "on-hold", label: "On Hold" },
                { value: "completed", label: "Completed" },
                { value: "overdue", label: "Overdue" },
              ]}
            />
          </FormField>
          <FormField label="Priority" error={errors.priority}>
            <Select
              value={form.priority}
              onChange={(v) => set("priority", v as Project["priority"])}
              options={[
                { value: "high", label: "High" },
                { value: "medium", label: "Medium" },
                { value: "low", label: "Low" },
              ]}
            />
          </FormField>
        </div>

        <div className="border-t border-[#f7f7f7] pt-4">
          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">Ownership</p>
        </div>

        <FormField label="Owner" required error={errors.owner}>
          <Select
            value={form.owner}
            onChange={(v) => set("owner", v)}
            placeholder="Select owner"
            options={employees.map((e) => ({ value: e.name, label: e.name }))}
          />
        </FormField>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-[#444]">
              Deadline
              {!form.deadlineTbd && <span className="text-[#f31260] ml-0.5">*</span>}
            </span>
            <button
              type="button"
              onClick={() => set("deadlineTbd", !form.deadlineTbd)}
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
              onChange={(v) => set("deadline", v)}
              placeholder="Pick a date & time"
            />
          )}
          {errors.deadline && (
            <p className="text-xs text-[#f31260] mt-1">{errors.deadline}</p>
          )}
        </div>

        {/* Client / Company */}
        <div className="border-t border-[#f7f7f7] pt-4">
          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">
            Client / Company
            <span className="ml-2 normal-case font-normal text-[#999]">Optional</span>
          </p>
        </div>

        <FormField label="Company Name">
          <input
            className={inputClass}
            placeholder="e.g. Acme Corp"
            value={form.clientName}
            onChange={(e) => set("clientName", e.target.value)}
          />
        </FormField>

        <FormField label="Location" hint="City, Country or full address">
          <input
            className={inputClass}
            placeholder="e.g. San Francisco, CA"
            value={form.clientLocation}
            onChange={(e) => set("clientLocation", e.target.value)}
          />
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
                <div className={`w-7 h-7 rounded-full ${selected ? "bg-[#0070f3]" : colors.bg} ${selected ? "text-white" : colors.text} flex items-center justify-center shrink-0`}>
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
  );
}
