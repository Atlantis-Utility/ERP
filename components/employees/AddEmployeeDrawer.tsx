"use client";

import { useState } from "react";
import Drawer from "@/components/ui/Drawer";
import { addNotification } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";
import FormField, { inputClass, selectClass } from "@/components/ui/FormField";
import { addEmployee } from "@/lib/db/employees";
import type { Employee, EmployeeStatus, AccessRole } from "@/lib/mock-data";

interface Props {
  open: boolean;
  onClose: () => void;
}

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  role: "",
  accessRole: "Contributor" as AccessRole,
  status: "active" as EmployeeStatus,
  location: "",
  startDate: new Date().toISOString().split("T")[0],
};

type FormErrors = Partial<Record<keyof typeof emptyForm, string>>;

export default function AddEmployeeDrawer({ open, onClose }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function set(field: keyof typeof emptyForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    if (saveError) setSaveError("");
  }

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Invalid email address";
    if (!form.phone.trim()) errs.phone = "Phone is required";
    if (!form.role.trim()) errs.role = "Role is required";
    if (!form.location.trim()) errs.location = "Location is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSaving(true);
    setSaveError("");
    const newEmp: Employee = {
      id: `emp-${Date.now()}`,
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      role: form.role.trim(),
      accessRole: form.accessRole,
      status: form.status,
      startDate: form.startDate,
      location: form.location.trim(),
      skills: [],
      salary: 0,
      access: [],
    };
    try {
      await addEmployee(newEmp);
      addNotification({
        prefId: "n-1",
        icon: "user",
        title: "New hire added",
        body: `${newEmp.name} joined as ${newEmp.role}`,
        href: `/employees/${newEmp.id}`,
      });
      logActivity({
        category: "employees",
        action: "Employee added",
        detail: `Added ${newEmp.name} as ${newEmp.role} in ${newEmp.location}`,
        metadata: { employeeId: newEmp.id, role: newEmp.role, status: newEmp.status },
      });
      setForm(emptyForm);
      setErrors({});
      setSaveError("");
      onClose();
    } catch (err) {
      console.error("[AddEmployeeDrawer] Failed to add employee:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setForm(emptyForm);
    setErrors({});
    setSaveError("");
    onClose();
  }


  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="Add Employee"
      subtitle="Fill in the details to add a new team member"
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
            {saving ? "Saving..." : "Add Employee"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {saveError && (
          <div className="bg-[#fff5f5] border border-[#fecaca] text-[#dc2626] text-sm px-4 py-3 rounded-lg">
            {saveError}
          </div>
        )}

        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">Basic Information</p>

        <FormField label="Full Name" required error={errors.name}>
          <input
            className={inputClass}
            placeholder="e.g. Jordan Smith"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Email" required error={errors.email}>
            <input
              className={inputClass}
              placeholder="jordan@atlantis.io"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </FormField>
          <FormField label="Phone" required error={errors.phone}>
            <input
              className={inputClass}
              placeholder="+1 (415) 555-0100"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </FormField>
        </div>

        <div className="border-t border-[#f7f7f7] pt-4">
          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">Role</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Job Title / Role" required error={errors.role}>
            <input
              className={inputClass}
              placeholder="e.g. Senior Software Engineer"
              value={form.role}
              onChange={(e) => set("role", e.target.value)}
            />
          </FormField>
          <FormField label="Status" error={errors.status}>
            <select
              className={selectClass}
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="active">Active</option>
              <option value="remote">Remote</option>
              <option value="on-leave">On Leave</option>
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Access Role" hint="Workspace permissions">
            <select
              className={selectClass}
              value={form.accessRole}
              onChange={(e) => set("accessRole", e.target.value)}
            >
              <option value="Administrator">Administrator — Full access</option>
              <option value="Manager">Manager — Manage teams &amp; projects</option>
              <option value="Analyst">Analyst — View &amp; export data</option>
              <option value="Contributor">Contributor — Add &amp; edit content</option>
              <option value="Viewer">Viewer — Read only</option>
            </select>
          </FormField>
          <FormField label="Start Date" error={errors.startDate}>
            <input
              className={inputClass}
              type="date"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </FormField>
        </div>

        <div className="border-t border-[#f7f7f7] pt-4">
          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">Location</p>
        </div>

        <FormField label="Location" required error={errors.location}>
          <input
            className={inputClass}
            placeholder="San Francisco, CA"
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
          />
        </FormField>

      </div>
    </Drawer>
  );
}
