"use client";

import { useState } from "react";
import Drawer from "@/components/ui/Drawer";
import FormField, { inputClass } from "@/components/ui/FormField";
import Select from "@/components/ui/Select";
import {
  VENDOR_CATEGORIES,
  emptyVendorContact,
  saveVendorContact,
  type VendorContact,
  type VendorCategory,
} from "@/lib/db/vendor-contacts";

interface Props {
  /** null = creating a new vendor. */
  contact: VendorContact | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

// The caller mounts this only while the drawer is open, so the state below
// starts fresh on every open and a cancelled edit can't leak into the next one
// — no reset effect needed.
export default function VendorContactDrawer({ contact, onClose, onSaved }: Props) {
  const [form, setForm] = useState<VendorContact>(() => contact ?? emptyVendorContact());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof VendorContact>(key: K, value: VendorContact[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.company.trim()) {
      setError("Company name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveVendorContact({ ...form, company: form.company.trim() });
      onSaved(contact ? `Updated ${form.company.trim()}` : `Added ${form.company.trim()}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={contact ? "Edit vendor" : "Add vendor"}
      subtitle="Support contacts for a company we buy from"
      width="lg"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-[13px] font-medium text-[#666] px-3 py-1.5 rounded-lg hover:bg-[#f1f1f1] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="text-[13px] font-medium text-white bg-[#0a0a0a] px-4 py-1.5 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : contact ? "Save changes" : "Add vendor"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Company" required>
            <input
              className={inputClass}
              value={form.company}
              onChange={(e) => set("company", e.target.value)}
              placeholder="e.g. Frontier"
            />
          </FormField>
          <FormField label="Category">
            <Select
              value={form.category}
              onChange={(v) => set("category", v as VendorCategory)}
              options={VENDOR_CATEGORIES.map((c) => ({ value: c, label: c }))}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Website">
            <input
              className={inputClass}
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://example.com"
            />
          </FormField>
          <FormField label="Account / billing portal">
            <input
              className={inputClass}
              value={form.portal}
              onChange={(e) => set("portal", e.target.value)}
              placeholder="https://portal.example.com"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Account number" hint="As printed on their invoice">
            <input
              className={inputClass}
              value={form.accountNumber}
              onChange={(e) => set("accountNumber", e.target.value)}
              placeholder="e.g. 1463261"
            />
          </FormField>
          <FormField label="Logo domain" hint="Optional, defaults to the website">
            <input
              className={inputClass}
              value={form.domain}
              onChange={(e) => set("domain", e.target.value)}
              placeholder="e.g. spectrum.com"
            />
          </FormField>
        </div>

        <div className="pt-2 border-t border-[#f1f1f1]">
          <p className="text-[11px] font-semibold text-[#999] uppercase tracking-widest mb-3 mt-3">
            General support
          </p>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Support phone">
              <input
                className={inputClass}
                value={form.supportPhone}
                onChange={(e) => set("supportPhone", e.target.value)}
                placeholder="(805) 555-0100"
              />
            </FormField>
            <FormField label="Support email">
              <input
                className={inputClass}
                value={form.supportEmail}
                onChange={(e) => set("supportEmail", e.target.value)}
                placeholder="support@example.com"
              />
            </FormField>
          </div>
        </div>

        <div className="pt-2 border-t border-[#f1f1f1]">
          <p className="text-[11px] font-semibold text-[#999] uppercase tracking-widest mb-3 mt-3">
            Point of contact
          </p>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Name">
              <input
                className={inputClass}
                value={form.pocName}
                onChange={(e) => set("pocName", e.target.value)}
                placeholder="e.g. Jordan Vega"
              />
            </FormField>
            <FormField label="Title / role">
              <input
                className={inputClass}
                value={form.pocTitle}
                onChange={(e) => set("pocTitle", e.target.value)}
                placeholder="e.g. Account Manager"
              />
            </FormField>
            <FormField label="Direct phone">
              <input
                className={inputClass}
                value={form.pocPhone}
                onChange={(e) => set("pocPhone", e.target.value)}
                placeholder="(805) 555-0142"
              />
            </FormField>
            <FormField label="Direct email">
              <input
                className={inputClass}
                value={form.pocEmail}
                onChange={(e) => set("pocEmail", e.target.value)}
                placeholder="jordan@example.com"
              />
            </FormField>
          </div>
        </div>

        <FormField label="Notes" hint="Escalation path, contract terms, anything worth remembering">
          <textarea
            className={`${inputClass} min-h-20 resize-y`}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="e.g. Ask for the NOC directly after 6pm PT"
          />
        </FormField>

        {error && <p className="text-xs text-[#f31260]">{error}</p>}
      </div>
    </Drawer>
  );
}
