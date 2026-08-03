"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Drawer from "@/components/ui/Drawer";
import FormField, { inputClass } from "@/components/ui/FormField";
import Select from "@/components/ui/Select";
import { updateEmployee, removeEmployee } from "@/lib/db/employees";
import { logActivity } from "@/lib/activity-log";
import { NAV_PAGES } from "@/lib/nav-pages";
import { Check } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { getErrorMessage } from "@/lib/utils";
import type { Employee, EmployeeStatus, AccessRole } from "@/lib/mock-data";

interface Props {
  open: boolean;
  onClose: () => void;
  employee: Employee;
}

const PAGE_SECTIONS = Array.from(new Set(NAV_PAGES.map((p) => p.section)));

export default function EditEmployeeDrawer({ open, onClose, employee }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    name:       employee.name,
    email:      employee.email,
    phone:      employee.phone ?? "",
    role:       employee.role,
    accessRole: (employee.accessRole ?? "Contributor") as AccessRole,
    status:     employee.status,
    location:   employee.location,
    startDate:  employee.startDate,
  });
  const [access, setAccess] = useState<string[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  // The form is long (Page Access alone can run past a screen's height), and
  // the Save button lives in a fixed footer — so a validation or save error
  // can land off-screen above the fold, looking like the click did nothing.
  useEffect(() => {
    if (saveError || Object.keys(errors).length > 0) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [saveError, errors]);

  useEffect(() => {
    setForm({
      name:       employee.name,
      email:      employee.email,
      phone:      employee.phone ?? "",
      role:       employee.role,
      accessRole: (employee.accessRole ?? "Contributor") as AccessRole,
      status:     employee.status,
      location:   employee.location,
      startDate:  employee.startDate,
    });
    setErrors({});
    setAccess(employee.access ?? []);
  }, [employee]);

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    if (saveError) setSaveError("");
  }

  function togglePage(href: string) {
    setAccess((prev) =>
      prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href]
    );
  }

  function validate() {
    const errs: Partial<Record<keyof typeof form, string>> = {};
    if (!form.name.trim())     errs.name     = "Name is required";
    if (!form.email.trim())    errs.email    = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Invalid email";
    if (!form.role.trim())     errs.role     = "Role is required";
    if (!form.location.trim()) errs.location = "Location is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setSaveError("");
    const patch: Partial<Employee> = {
      name:       form.name.trim(),
      email:      form.email.trim().toLowerCase(),
      phone:      form.phone.trim(),
      role:       form.role.trim(),
      accessRole: form.accessRole,
      status:     form.status as EmployeeStatus,
      location:   form.location.trim(),
      startDate:  form.startDate,
      access,
    };
    try {
      await updateEmployee(employee.id, patch);
    } catch (err) {
      console.error("[EditEmployeeDrawer] Failed to update:", JSON.stringify(err, Object.getOwnPropertyNames(err ?? {})), err);
      setSaveError(getErrorMessage(err, "Failed to save. Please try again."));
      setSaving(false);
      return;
    }

    // The database write already succeeded — logging is best-effort, so a
    // failure here must not be reported as "the save failed" or block the close.
    // Page-access changes reach the sidebar via auth-context's live Supabase
    // subscription on the employee row, not a local mirror.
    try {
      logActivity({
        category: "employees",
        action: "Employee updated",
        detail: `Updated profile for ${patch.name ?? employee.name}`,
        metadata: { employeeId: employee.id },
      });
    } catch (err) {
      console.error("[EditEmployeeDrawer] Post-save side effect failed (update itself succeeded):", getErrorMessage(err, String(err)));
    }
    setSaving(false);
    onClose();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await removeEmployee(employee.id);
      logActivity({
        category: "employees",
        action: "Employee removed",
        detail: `Removed ${employee.name} (${employee.role})`,
        metadata: { employeeId: employee.id },
      });
      onClose();
      router.push("/employees");
    } catch (err) {
      console.error("[EditEmployeeDrawer] Delete failed:", JSON.stringify(err, Object.getOwnPropertyNames(err ?? {})), err);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Edit Profile"
      subtitle={`Editing ${employee.name}`}
      footer={
        <>
          <button
            onClick={onClose}
            className="border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#0a0a0a] text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div ref={errorRef} />
        {saveError && (
          <div className="bg-[#fff5f5] border border-[#fecaca] text-[#dc2626] text-sm px-4 py-3 rounded-lg">
            {saveError}
          </div>
        )}

        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">Basic Information</p>

        <FormField label="Full Name" required error={errors.name}>
          <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Email" required error={errors.email}>
            <input className={inputClass} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </FormField>
          <FormField label="Phone" error={errors.phone}>
            <input className={inputClass} placeholder="+1 (415) 555-0100" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </FormField>
        </div>

        <div className="border-t border-[#f7f7f7] pt-4">
          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">Role</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Job Title / Role" required error={errors.role}>
            <input className={inputClass} value={form.role} onChange={(e) => set("role", e.target.value)} />
          </FormField>
          <FormField label="Status">
            <Select
              value={form.status}
              onChange={(v) => set("status", v)}
              options={[
                { value: "active", label: "Active" },
                { value: "remote", label: "Remote" },
                { value: "on-leave", label: "On Leave" },
              ]}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Access Role" hint="Workspace permissions">
            <Select
              value={form.accessRole}
              onChange={(v) => set("accessRole", v)}
              options={[
                { value: "Administrator", label: "Administrator: Full access" },
                { value: "Manager", label: "Manager: Manage teams & projects" },
                { value: "Analyst", label: "Analyst: View & export data" },
                { value: "Contributor", label: "Contributor: Add & edit content" },
                { value: "Viewer", label: "Viewer: Read only" },
              ]}
            />
          </FormField>
          <FormField label="Start Date">
            <input className={inputClass} type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </FormField>
        </div>

        <div className="border-t border-[#f7f7f7] pt-4">
          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">Location</p>
        </div>

        <FormField label="Location" required error={errors.location}>
          <input className={inputClass} value={form.location} onChange={(e) => set("location", e.target.value)} />
        </FormField>

        <div className="border-t border-[#f7f7f7] pt-4">
          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-1">Page Access</p>
          <p className="text-xs text-[#999] mb-3">{access.length} of {NAV_PAGES.length} pages granted</p>
        </div>

        <div className="space-y-4">
          {PAGE_SECTIONS.map((section) => {
            const pages = NAV_PAGES.filter((p) => p.section === section);
            return (
              <div key={section}>
                <p className="text-[10px] font-semibold text-[#bbb] uppercase tracking-widest mb-2">{section}</p>
                <div className="flex flex-wrap gap-2">
                  {pages.map((page) => {
                    const granted = access.includes(page.href);
                    return (
                      <button
                        key={page.href}
                        type="button"
                        onClick={() => togglePage(page.href)}
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                          granted
                            ? "bg-[#0a0a0a] text-white border-[#0a0a0a] hover:bg-[#333]"
                            : "bg-white text-[#999] border-[#eaeaea] hover:border-[#aaa] hover:text-[#555]"
                        }`}
                      >
                        {granted && <Check className="w-3 h-3 shrink-0" />}
                        {page.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Danger zone */}
        <div className="border-t border-[#f7f7f7] pt-4 mt-2">
          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">Danger Zone</p>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-2 text-sm font-medium text-[#dc2626] border border-[#fecaca] px-4 py-2 rounded-lg hover:bg-[#fff5f5] transition-colors"
          >
            Delete Employee
          </button>
        </div>

        <ConfirmDialog
          open={confirmDelete}
          title={`Delete ${employee.name}?`}
          description={`This will permanently remove ${employee.name} from the system. All their data will be lost and this cannot be undone.`}
          confirmLabel={deleting ? "Deleting…" : "Yes, Delete"}
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      </div>
    </Drawer>
  );
}
