"use client";

import { useEffect, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import FormField, { inputClass } from "@/components/ui/FormField";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_CONTACT_ID,
  setCustomerProfile,
  type CustomerContact,
  type CustomerProfileOverlay,
} from "@/lib/db/customer-profiles";

interface DefaultContact {
  name: string;
  email: string;
  phone: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  customerId: string;
  defaultContact: DefaultContact;
  overlay: CustomerProfileOverlay | null;
  onSaved: (overlay: CustomerProfileOverlay) => void;
}

function newContactId() {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function EditCustomerDetailsDrawer({
  open, onClose, customerId, defaultContact, overlay, onSaved,
}: Props) {
  const { authUser } = useAuth();
  const [isp, setIsp] = useState("");
  const [backupIsp, setBackupIsp] = useState("");
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [mainContactId, setMainContactId] = useState(DEFAULT_CONTACT_ID);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsp(overlay?.isp ?? "");
    setBackupIsp(overlay?.backupIsp ?? "");
    setContacts(overlay?.contacts ?? []);
    setMainContactId(overlay?.mainContactId ?? DEFAULT_CONTACT_ID);
  }, [open, overlay]);

  function addContact() {
    setContacts((prev) => [...prev, { id: newContactId(), name: "", designation: "", email: "", phone: "" }]);
  }

  function removeContact(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    if (mainContactId === id) setMainContactId(DEFAULT_CONTACT_ID);
  }

  function updateContact(id: string, field: keyof CustomerContact, value: string) {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const filtered = contacts.filter(
        (c) => c.name.trim() || c.designation.trim() || c.email.trim() || c.phone.trim()
      );
      const validMainId = filtered.some((c) => c.id === mainContactId) ? mainContactId : DEFAULT_CONTACT_ID;
      const next = {
        isp: isp.trim(),
        backupIsp: backupIsp.trim(),
        contacts: filtered,
        mainContactId: validMainId,
      };
      await setCustomerProfile(customerId, next, authUser?.email ?? undefined);
      onSaved({
        customerId,
        ...next,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser?.email ?? undefined,
      });
      onClose();
    } catch (err) {
      console.error("[EditCustomerDetailsDrawer] Failed to save:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Edit Customer Details"
      subtitle="ISP information and points of contact"
      width="lg"
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
        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">Internet Service</p>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Internet Service Provider">
            <input
              className={inputClass}
              placeholder="e.g. Comcast"
              value={isp}
              onChange={(e) => setIsp(e.target.value)}
            />
          </FormField>
          <FormField label="Backup Internet Service Provider">
            <input
              className={inputClass}
              placeholder="e.g. AT&T"
              value={backupIsp}
              onChange={(e) => setBackupIsp(e.target.value)}
            />
          </FormField>
        </div>

        <div className="border-t border-[#f7f7f7] pt-4">
          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">Points of Contact</p>
        </div>

        <div className="space-y-3">
          {/* RingLogix-sourced default contact — always present, not editable here, but selectable as main */}
          <div className="border border-[#eaeaea] rounded-lg p-3 space-y-2 bg-[#fafafa]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-[#444]">RingLogix Contact</p>
                {mainContactId === DEFAULT_CONTACT_ID && (
                  <span className="text-[9px] font-semibold text-[#0070f3] bg-[#e8f2ff] px-1.5 py-0.5 rounded-full uppercase tracking-wide">Main</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMainContactId(DEFAULT_CONTACT_ID)}
                className={`flex items-center gap-1.5 text-[10px] transition-colors select-none ${mainContactId === DEFAULT_CONTACT_ID ? "text-[#0070f3]" : "text-[#999] hover:text-[#555]"}`}
              >
                <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${mainContactId === DEFAULT_CONTACT_ID ? "border-[#0070f3]" : "border-[#d4d4d4] hover:border-[#999]"}`}>
                  {mainContactId === DEFAULT_CONTACT_ID && <div className="w-1.5 h-1.5 rounded-full bg-[#0070f3]" />}
                </div>
                Main
              </button>
            </div>
            <p className="text-sm text-[#0a0a0a]">{defaultContact.name || "-"}</p>
            <p className="text-xs text-[#666]">{defaultContact.email || "-"} · {defaultContact.phone || "-"}</p>
          </div>

          {contacts.map((contact) => (
            <div key={contact.id} className="border border-[#eaeaea] rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-[#444]">Contact</p>
                  {contact.id === mainContactId && (
                    <span className="text-[9px] font-semibold text-[#0070f3] bg-[#e8f2ff] px-1.5 py-0.5 rounded-full uppercase tracking-wide">Main</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMainContactId(contact.id)}
                    className={`flex items-center gap-1.5 text-[10px] transition-colors select-none ${contact.id === mainContactId ? "text-[#0070f3]" : "text-[#999] hover:text-[#555]"}`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${contact.id === mainContactId ? "border-[#0070f3]" : "border-[#d4d4d4] hover:border-[#999]"}`}>
                      {contact.id === mainContactId && <div className="w-1.5 h-1.5 rounded-full bg-[#0070f3]" />}
                    </div>
                    Main
                  </button>
                  <button
                    type="button"
                    onClick={() => removeContact(contact.id)}
                    className="text-[10px] text-[#f31260] hover:text-[#d00050] transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Full Name">
                  <input
                    className={inputClass}
                    placeholder="e.g. Jane Smith"
                    value={contact.name}
                    onChange={(e) => updateContact(contact.id, "name", e.target.value)}
                  />
                </FormField>
                <FormField label="Designation">
                  <input
                    className={inputClass}
                    placeholder="e.g. IT Manager"
                    value={contact.designation}
                    onChange={(e) => updateContact(contact.id, "designation", e.target.value)}
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Phone">
                  <input
                    className={inputClass}
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={contact.phone}
                    onChange={(e) => updateContact(contact.id, "phone", e.target.value)}
                  />
                </FormField>
                <FormField label="Email">
                  <input
                    className={inputClass}
                    type="email"
                    placeholder="name@company.com"
                    value={contact.email}
                    onChange={(e) => updateContact(contact.id, "email", e.target.value)}
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
    </Drawer>
  );
}
