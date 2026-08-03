"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Wand2, Plus, X } from "lucide-react";
import VaultModal from "@/components/vault/VaultModal";
import FormField, { inputClass } from "@/components/ui/FormField";
import Select from "@/components/ui/Select";
import { VAULT_CATEGORIES } from "@/lib/vault-types";
import type { VaultCategory, VaultEntryMeta } from "@/lib/vault-types";
import { generateStrongPassword, estimatePasswordStrength } from "@/lib/vault-client-utils";

interface PortalCustomer {
  id: string;
  company: string;
}

const emptyForm = {
  name: "",
  category: "other" as VaultCategory,
  accountId: "",
  email: "",
  password: "",
  pin: "",
  website: "",
  phoneNumbers: [""] as string[],
  pointsOfContact: [""] as string[],
  customerId: "",
  customerName: "",
  notes: "",
  tags: "",
};

export type VaultFormValues = typeof emptyForm;

type FormErrors = Partial<Record<"name" | "password", string>>;

const STRENGTH_COLORS = ["bg-[#f31260]", "bg-[#f5a524]", "bg-[#f5a524]", "bg-[#17c964]", "bg-[#17c964]"];

interface Props {
  open: boolean;
  onClose: () => void;
  // Undefined = create mode. Provided = edit mode (password/PIN left blank keep the existing ones).
  entry?: VaultEntryMeta;
  onSave: (data: VaultFormValues) => Promise<void>;
}

// A list of plain-text values with add/remove rows, used for phone numbers
// and points of contact, both of which the vault now allows more than one of.
function MultiTextField({
  label, values, onChange, placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  function setAt(i: number, value: string) {
    onChange(values.map((v, idx) => (idx === i ? value : v)));
  }
  function removeAt(i: number) {
    onChange(values.length === 1 ? [""] : values.filter((_, idx) => idx !== i));
  }
  return (
    <FormField label={label}>
      <div className="space-y-2">
        {values.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              className={inputClass}
              placeholder={placeholder}
              value={v}
              onChange={(e) => setAt(i, e.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => removeAt(i)}
              title="Remove"
              className="shrink-0 p-2 rounded-lg border border-[#eaeaea] text-[#999] hover:bg-[#fafafa] hover:text-[#666] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...values, ""])}
          className="flex items-center gap-1.5 text-xs font-medium text-[#666] hover:text-[#0a0a0a] transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add another
        </button>
      </div>
    </FormField>
  );
}

export default function VaultFormDrawer({ open, onClose, entry, onSave }: Props) {
  const [form, setForm] = useState<VaultFormValues>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<PortalCustomer[]>([]);
  const isEdit = !!entry;

  useEffect(() => {
    if (!open) return;
    setForm(
      entry
        ? {
            name: entry.name,
            category: entry.category,
            accountId: entry.accountId ?? "",
            email: entry.email ?? "",
            password: "",
            pin: "",
            website: entry.website ?? "",
            phoneNumbers: entry.phoneNumbers.length > 0 ? entry.phoneNumbers : [""],
            pointsOfContact: entry.pointsOfContact.length > 0 ? entry.pointsOfContact : [""],
            customerId: entry.customerId ?? "",
            customerName: entry.customerName ?? "",
            notes: entry.notes ?? "",
            tags: (entry.tags ?? []).join(", "),
          }
        : emptyForm
    );
    setErrors({});
    setShowPassword(false);
    setShowPin(false);
  }, [open, entry]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/ringlogix/customers")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCustomers(Array.isArray(data) ? data : (data.data ?? [])))
      .catch(() => setCustomers([]));
  }, [open]);

  function set<K extends keyof VaultFormValues>(field: K, value: VaultFormValues[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "name" && errors.name) setErrors((p) => ({ ...p, name: undefined }));
    if (field === "password" && errors.password) setErrors((p) => ({ ...p, password: undefined }));
  }

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!isEdit && !form.password) errs.password = "Password is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const strength = form.password ? estimatePasswordStrength(form.password) : null;

  return (
    <VaultModal
      open={open}
      onClose={onClose}
      width="lg"
      title={isEdit ? "Edit Key" : "New Key"}
      subtitle={isEdit ? entry?.name : "Store a company credential securely"}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={saving}
            className="border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-[#0a0a0a] text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Key"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest">Key</p>

        <FormField label="Key Name" required error={errors.name} hint="e.g. AWS Root Account, Office Front Door">
          <input
            className={inputClass}
            placeholder="e.g. AWS Root Account"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            autoComplete="off"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Category">
            <Select
              value={form.category}
              onChange={(v) => set("category", v as VaultCategory)}
              options={VAULT_CATEGORIES}
            />
          </FormField>
          <FormField label="ID">
            <input
              className={inputClass}
              placeholder="Account / login ID"
              value={form.accountId}
              onChange={(e) => set("accountId", e.target.value)}
              autoComplete="off"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Email">
            <input
              className={inputClass}
              placeholder="account@company.com"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              autoComplete="off"
            />
          </FormField>
          <FormField label="Website">
            <input
              className={inputClass}
              placeholder="https://example.com/login"
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
              autoComplete="off"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Password"
            required={!isEdit}
            error={errors.password}
            hint={isEdit ? "Leave blank to keep the current password" : undefined}
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  className={`${inputClass} pr-9 font-mono`}
                  type={showPassword ? "text" : "password"}
                  placeholder={isEdit ? "Leave blank to keep current" : "Enter or generate"}
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#0a0a0a] transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => { set("password", generateStrongPassword()); setShowPassword(true); }}
                title="Generate a strong password"
                className="shrink-0 flex items-center gap-1.5 border border-[#eaeaea] rounded-lg px-3 text-xs font-medium text-[#444] hover:bg-[#fafafa] transition-colors"
              >
                <Wand2 className="w-3.5 h-3.5" />
                Generate
              </button>
            </div>
            {strength && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full ${i <= strength.score ? STRENGTH_COLORS[strength.score] : "bg-[#eee]"}`}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-[#999] mt-1">{strength.label}</p>
              </div>
            )}
          </FormField>

          <FormField label="PIN" hint={isEdit ? "Leave blank to keep the current PIN, if any" : "Optional, a separate access code"}>
            <div className="relative">
              <input
                className={`${inputClass} pr-9 font-mono`}
                type={showPin ? "text" : "password"}
                placeholder={isEdit ? "Leave blank to keep current" : "Optional"}
                value={form.pin}
                onChange={(e) => set("pin", e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowPin((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#0a0a0a] transition-colors"
                tabIndex={-1}
              >
                {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </FormField>
        </div>

        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest pt-2">Links & Contact</p>

        <div className="grid grid-cols-2 gap-4">
          <MultiTextField
            label="Phone Numbers"
            values={form.phoneNumbers}
            onChange={(v) => set("phoneNumbers", v)}
            placeholder="(555) 555-5555"
          />

          <MultiTextField
            label="Points of Contact"
            values={form.pointsOfContact}
            onChange={(v) => set("pointsOfContact", v)}
            placeholder="Internal or client-side owner"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Linked Company" hint="Which customer this key belongs to, if any">
            <Select
              value={form.customerId}
              onChange={(v) => {
                const c = customers.find((x) => x.id === v);
                setForm((prev) => ({ ...prev, customerId: v, customerName: c?.company ?? "" }));
              }}
              options={[{ value: "", label: "None" }, ...customers.map((c) => ({ value: c.id, label: c.company }))]}
              searchable
            />
          </FormField>

          <FormField label="Tags" hint="Comma-separated">
            <input
              className={inputClass}
              placeholder="e.g. billing, critical"
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              autoComplete="off"
            />
          </FormField>
        </div>

        <FormField label="Notes">
          <textarea
            className={`${inputClass} resize-none`}
            rows={3}
            placeholder="Recovery info, 2FA notes, etc."
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </FormField>
      </div>
    </VaultModal>
  );
}
