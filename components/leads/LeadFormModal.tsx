"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import Select from "@/components/ui/Select";
import { useAuth } from "@/lib/auth-context";
import { useEmployees } from "@/lib/db/employees";
import { addLead, updateLead, type Lead, type LeadStatus } from "@/lib/db/leads";
import { STATUS_OPTIONS } from "@/lib/leads-constants";
import { useDraft } from "@/lib/use-draft";

type FormState = {
  companyName: string;
  dba: string;
  businessType: string;
  pocName: string;
  pocTitle: string;
  phone: string;
  email: string;
  website: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  companySize: string;
  linkedinUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  status: LeadStatus;
  notes: string;
  assignedTo: string;
  followUpDate: string;
};

function toForm(lead?: Lead, defaultAssignee?: string): FormState {
  return {
    companyName: lead?.companyName ?? "",
    dba: lead?.dba ?? "",
    businessType: lead?.businessType ?? "",
    pocName: lead?.pocName ?? "",
    pocTitle: lead?.pocTitle ?? "",
    phone: lead?.phone ?? "",
    email: lead?.email ?? "",
    website: lead?.website ?? "",
    street: lead?.street ?? "",
    city: lead?.city ?? "",
    state: lead?.state ?? "",
    zip: lead?.zip ?? "",
    companySize: lead?.companySize ?? "",
    linkedinUrl: lead?.linkedinUrl ?? "",
    instagramUrl: lead?.instagramUrl ?? "",
    facebookUrl: lead?.facebookUrl ?? "",
    status: lead?.status ?? "new",
    notes: lead?.notes ?? "",
    assignedTo: lead?.assignedTo ?? defaultAssignee ?? "",
    followUpDate: lead?.followUpDate ?? "",
  };
}

const inputClass = "text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors w-full";
const labelClass = "text-[10px] font-semibold text-[#999] uppercase tracking-wider";

export default function LeadFormModal({ lead, onClose, onSaved }: { lead?: Lead; onClose: () => void; onSaved: () => void }) {
  const { authUser } = useAuth();
  const employees = useEmployees();
  // Survives a tab switch, backgrounded/discarded tab, or accidental
  // refresh, a form this long is expensive to lose mid-entry.
  const [form, setForm, clearDraft] = useDraft<FormState>(
    `atlantis-lead-draft:${lead?.id ?? "new"}`,
    toForm(lead, authUser?.employeeId ?? undefined)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm({ ...form, [key]: value });

  async function save() {
    if (!form.companyName.trim()) {
      setError("Company name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const assignedEmployee = employees.find((e) => e.id === form.assignedTo);
      const patch = {
        companyName: form.companyName.trim(),
        dba: form.dba.trim() || undefined,
        businessType: form.businessType.trim() || undefined,
        pocName: form.pocName.trim() || undefined,
        pocTitle: form.pocTitle.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        website: form.website.trim() || undefined,
        street: form.street.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        zip: form.zip.trim() || undefined,
        companySize: form.companySize.trim() || undefined,
        linkedinUrl: form.linkedinUrl.trim() || undefined,
        instagramUrl: form.instagramUrl.trim() || undefined,
        facebookUrl: form.facebookUrl.trim() || undefined,
        status: form.status,
        notes: form.notes.trim() || undefined,
        assignedTo: form.assignedTo || undefined,
        assignedToName: assignedEmployee?.name,
        followUpDate: form.followUpDate || undefined,
      };
      if (lead) {
        await updateLead(lead.id, patch);
      } else {
        await addLead({
          id: `lead-${crypto.randomUUID()}`,
          source: "manual",
          createdAt: now,
          updatedAt: now,
          ...patch,
        });
      }
      clearDraft();
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#eaeaea] shrink-0">
          <p className="text-sm font-semibold text-[#0a0a0a]">{lead ? "Edit Lead" : "Add Lead"}</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#f5f5f5] transition-colors text-[#999]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Company Name *</label>
              <input className={inputClass} value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>DBA</label>
              <input className={inputClass} value={form.dba} onChange={(e) => set("dba", e.target.value)} placeholder="Trade name, if different" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>Business Type</label>
            <input className={inputClass} value={form.businessType} onChange={(e) => set("businessType", e.target.value)} placeholder="e.g. HVAC Contractor" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Point of Contact</label>
              <input className={inputClass} value={form.pocName} onChange={(e) => set("pocName", e.target.value)} placeholder="Name" />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Title</label>
              <input className={inputClass} value={form.pocTitle} onChange={(e) => set("pocTitle", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Phone</label>
              <input className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Email</label>
              <input type="email" className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>Website</label>
            <input className={inputClass} value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>Street</label>
            <input className={inputClass} value={form.street} onChange={(e) => set("street", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>City</label>
              <input className={inputClass} value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>State</label>
              <input className={inputClass} value={form.state} onChange={(e) => set("state", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Zip Code</label>
              <input className={inputClass} value={form.zip} onChange={(e) => set("zip", e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>Company Size</label>
            <input className={inputClass} value={form.companySize} onChange={(e) => set("companySize", e.target.value)} placeholder="e.g. 11-50" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>LinkedIn</label>
              <input className={inputClass} value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} placeholder="linkedin.com/…" />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Instagram</label>
              <input className={inputClass} value={form.instagramUrl} onChange={(e) => set("instagramUrl", e.target.value)} placeholder="instagram.com/…" />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Facebook</label>
              <input className={inputClass} value={form.facebookUrl} onChange={(e) => set("facebookUrl", e.target.value)} placeholder="facebook.com/…" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Assigned To</label>
              <Select
                value={form.assignedTo}
                onChange={(v) => set("assignedTo", v)}
                placeholder="Unassigned"
                options={employees.map((e) => ({ value: e.id, label: e.name }))}
                clearable
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Follow Up By</label>
              <input type="date" className={inputClass} value={form.followUpDate} onChange={(e) => set("followUpDate", e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>Status</label>
            <Select value={form.status} onChange={(v) => set("status", v as LeadStatus)} options={STATUS_OPTIONS} />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>Notes</label>
            <textarea className={inputClass + " min-h-20 resize-none"} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          {error && <p className="text-xs text-[#f31260]">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#eaeaea] shrink-0">
          <button onClick={onClose} className="text-sm border border-[#eaeaea] bg-white text-[#0a0a0a] font-medium px-4 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors">Cancel</button>
          <button onClick={save} disabled={saving} className="text-sm bg-[#0070f3] text-white font-medium px-4 py-1.5 rounded-lg hover:bg-[#005fcc] transition-colors disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {lead ? "Save Changes" : "Add Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
