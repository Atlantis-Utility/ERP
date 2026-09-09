"use client";

import { useEffect, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import FormField, { inputClass } from "@/components/ui/FormField";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_CONTACT_ID,
  setCustomerProfile,
  newStaticIp,
  hasStaticIpDetail,
  type CustomerContact,
  type CustomerProfileOverlay,
  type StaticIpConfig,
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
  /** WAN IPs off the linked UniFi site — offered as one-tap fill for the IP field. */
  suggestedIps?: string[];
  /** How many static IPs the provider invoice says this customer pays for. */
  billedStaticIps?: number;
}

function newContactId() {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function EditCustomerDetailsDrawer({
  open, onClose, customerId, defaultContact, overlay, onSaved,
  suggestedIps = [], billedStaticIps = 0,
}: Props) {
  const { authUser } = useAuth();
  const [isp, setIsp] = useState("");
  const [backupIsp, setBackupIsp] = useState("");
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [mainContactId, setMainContactId] = useState(DEFAULT_CONTACT_ID);
  const [staticIps, setStaticIps] = useState<StaticIpConfig[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsp(overlay?.isp ?? "");
    setBackupIsp(overlay?.backupIsp ?? "");
    setContacts(overlay?.contacts ?? []);
    setMainContactId(overlay?.mainContactId ?? DEFAULT_CONTACT_ID);

    // Nothing saved yet: open one blank row per static IP the invoice bills
    // for, pre-filling the address from the linked site's WAN where we have
    // it. Mask/gateway/DNS aren't in UniFi's API, so those stay empty.
    const saved = overlay?.staticIps ?? [];
    if (saved.length > 0) {
      setStaticIps(saved);
    } else {
      const rows = Math.max(billedStaticIps, suggestedIps.length);
      setStaticIps(
        Array.from({ length: rows }, (_, i) => newStaticIp({ ip: suggestedIps[i] ?? "" }))
      );
    }
  // Keyed on primitives (customerId, whether overlay has loaded yet, and a
  // stringified suggestedIps) rather than the `overlay`/`suggestedIps`
  // object/array references directly — those come from the parent's async
  // load and prop churn respectively, and a whole-reference dependency here
  // would re-seed the form (wiping in-progress edits) on any incidental
  // re-render that produces a new reference with the same content.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerId, Boolean(overlay), billedStaticIps, suggestedIps.join(",")]);

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

  function updateStaticIp(id: string, field: keyof StaticIpConfig, value: string) {
    setStaticIps((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const filtered = contacts.filter(
        (c) => c.name.trim() || c.designation.trim() || c.email.trim() || c.phone.trim()
      );
      const validMainId = filtered.some((c) => c.id === mainContactId) ? mainContactId : DEFAULT_CONTACT_ID;
      // Drop rows the user never filled in — the blank ones we pre-opened from
      // the invoice count are a prompt, not data worth storing.
      const filledIps = staticIps
        .map((s) => ({
          ...s,
          ip: s.ip.trim(),
          subnetMask: s.subnetMask.trim(),
          gateway: s.gateway.trim(),
          dnsPrimary: s.dnsPrimary.trim(),
          dnsSecondary: s.dnsSecondary.trim(),
          label: s.label.trim(),
          notes: s.notes.trim(),
        }))
        .filter(hasStaticIpDetail);
      const next = {
        isp: isp.trim(),
        backupIsp: backupIsp.trim(),
        contacts: filtered,
        mainContactId: validMainId,
        staticIps: filledIps,
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
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest">Static IPs</p>
            {billedStaticIps > 0 && (
              <p className="text-[10px] text-[#999]">
                Invoice bills {billedStaticIps} static IP{billedStaticIps > 1 ? "s" : ""}
              </p>
            )}
          </div>
          <p className="text-[10px] text-[#bbb] mb-3">
            UniFi only reports the WAN address, mask, gateway and DNS are entered by hand. Blank rows aren&apos;t saved.
          </p>

          <div className="space-y-3">
            {staticIps.map((s, i) => (
              <div key={s.id} className="border border-[#eaeaea] rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-[#444]">Static IP {i + 1}</p>
                  <button
                    type="button"
                    onClick={() => setStaticIps((prev) => prev.filter((x) => x.id !== s.id))}
                    className="text-[10px] text-[#f31260] hover:text-[#d00050] transition-colors"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="IP Address">
                    <input
                      className={inputClass}
                      placeholder="45.41.26.67"
                      value={s.ip}
                      onChange={(e) => updateStaticIp(s.id, "ip", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Subnet Mask">
                    <input
                      className={inputClass}
                      placeholder="255.255.255.248"
                      value={s.subnetMask}
                      onChange={(e) => updateStaticIp(s.id, "subnetMask", e.target.value)}
                    />
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Gateway">
                    <input
                      className={inputClass}
                      placeholder="45.41.26.65"
                      value={s.gateway}
                      onChange={(e) => updateStaticIp(s.id, "gateway", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Circuit Label">
                    <input
                      className={inputClass}
                      placeholder="e.g. Lytwave WAN1"
                      value={s.label}
                      onChange={(e) => updateStaticIp(s.id, "label", e.target.value)}
                    />
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="DNS Primary">
                    <input
                      className={inputClass}
                      placeholder="8.8.8.8"
                      value={s.dnsPrimary}
                      onChange={(e) => updateStaticIp(s.id, "dnsPrimary", e.target.value)}
                    />
                  </FormField>
                  <FormField label="DNS Secondary">
                    <input
                      className={inputClass}
                      placeholder="8.8.4.4"
                      value={s.dnsSecondary}
                      onChange={(e) => updateStaticIp(s.id, "dnsSecondary", e.target.value)}
                    />
                  </FormField>
                </div>
                <FormField label="Notes">
                  <input
                    className={inputClass}
                    placeholder="Anything worth remembering"
                    value={s.notes}
                    onChange={(e) => updateStaticIp(s.id, "notes", e.target.value)}
                  />
                </FormField>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setStaticIps((prev) => [...prev, newStaticIp()])}
              className="w-full text-sm text-[#0070f3] border border-dashed border-[#0070f3]/40 rounded-lg py-2 hover:bg-[#eff6ff] transition-colors"
            >
              + Add a static IP
            </button>
          </div>
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
