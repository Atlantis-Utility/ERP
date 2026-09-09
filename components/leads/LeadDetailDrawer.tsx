"use client";

import { useMemo, useState } from "react";
import {
  Trash2, Send, Check, AlertTriangle, Loader2, MessageSquare, Pencil,
} from "lucide-react";
import Drawer from "@/components/ui/Drawer";
import FormField, { inputClass } from "@/components/ui/FormField";
import Select from "@/components/ui/Select";
import { useAuth } from "@/lib/auth-context";
import { useEmployees } from "@/lib/db/employees";
import { useCurrentEmployeeId } from "@/lib/hooks/use-current-employee-id";
import { useLeads, updateLead, type Lead, type LeadStatus } from "@/lib/db/leads";
import { useLeadNotes, addLeadNote, updateLeadNote, removeLeadNote, type LeadNote } from "@/lib/db/lead-notes";
import { STATUS_OPTIONS, STATUS_STYLES, isFollowUpOverdue, formatAddress } from "@/lib/leads-constants";
import { getAvatarColor, getInitials, getErrorMessage } from "@/lib/utils";
import { useDraft } from "@/lib/use-draft";

// Matches FormField's own label styling (components/ui/FormField.tsx), so
// the read-only view mode and the editable form don't look like two
// different design systems stitched together.
const viewLabelClass = "text-xs font-medium text-[#444] uppercase tracking-wider mb-1.5";
// Section header style, exactly matching the "PROJECT DETAILS" / "OWNERSHIP"
// groupings in the Edit Project drawer (app/(dashboard)/projects/[id]/page.tsx).
const sectionLabelClass = "text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3";

type EditFormState = {
  status: LeadStatus;
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
  assignedTo: string;
  followUpDate: string;
};

function toEditForm(lead: Lead): EditFormState {
  return {
    status: lead.status,
    dba: lead.dba ?? "",
    businessType: lead.businessType ?? "",
    pocName: lead.pocName ?? "",
    pocTitle: lead.pocTitle ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    website: lead.website ?? "",
    street: lead.street ?? "",
    city: lead.city ?? "",
    state: lead.state ?? "",
    zip: lead.zip ?? "",
    companySize: lead.companySize ?? "",
    linkedinUrl: lead.linkedinUrl ?? "",
    instagramUrl: lead.instagramUrl ?? "",
    facebookUrl: lead.facebookUrl ?? "",
    assignedTo: lead.assignedTo ?? "",
    followUpDate: lead.followUpDate ?? "",
  };
}

const EMPTY_EDIT_FORM: EditFormState = {
  status: "new", dba: "", businessType: "", pocName: "", pocTitle: "", phone: "", email: "",
  website: "", street: "", city: "", state: "", zip: "", companySize: "",
  linkedinUrl: "", instagramUrl: "", facebookUrl: "", assignedTo: "", followUpDate: "",
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function newNoteId() {
  return `lead-note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Read-only label/value pair for view mode. Fields with no value are simply
// omitted by the caller rather than shown as a dash, "muted" is only for the
// couple of fields (Assigned To, Follow Up) that stay visible either way and
// need a softer empty state.
function ViewField({ label, value, href, muted }: { label: string; value: string; href?: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={viewLabelClass}>{label}</p>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="text-sm font-medium text-[#0070f3] hover:underline truncate block">{value}</a>
      ) : (
        <p className={`text-sm truncate ${muted ? "text-[#bbb]" : "font-medium text-[#0a0a0a]"}`}>{value}</p>
      )}
    </div>
  );
}

function withScheme(url?: string): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export default function LeadDetailDrawer({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { authUser } = useAuth();
  const employees = useEmployees();
  const leads = useLeads();
  const allNotes = useLeadNotes();

  const lead = leads.find((l) => l.id === leadId);

  const myId = useCurrentEmployeeId();
  const myName = authUser?.displayName || "Me";

  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  // Staged edits, only committed on "Save Changes" (matches the Edit Project
  // drawer's Cancel/Save pattern). Backed by useDraft so a tab switch or
  // accidental refresh mid-edit doesn't lose anything either.
  const [form, setForm, clearFormDraft] = useDraft<EditFormState>(
    `atlantis-lead-edit-draft:${leadId}`,
    lead ? toEditForm(lead) : EMPTY_EDIT_FORM
  );
  const [savingEdits, setSavingEdits] = useState(false);
  // A half-typed note is easy to lose to a tab switch otherwise, it's not
  // saved to the DB until "Add Note" is clicked.
  const [newNoteBody, setNewNoteBody, clearNoteDraft] = useDraft(`atlantis-lead-note-draft:${leadId}`, "");
  const [savingNote, setSavingNote] = useState(false);
  const [shareOpenFor, setShareOpenFor] = useState<string | null>(null);

  const visibleNotes = useMemo(
    () => allNotes
      .filter((n) => n.leadId === leadId && (n.authorId === myId || n.recipientIds.includes(myId)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [allNotes, leadId, myId]
  );

  if (!lead) {
    return (
      <Drawer open onClose={onClose} title="Lead" width="lg">
        <p className="text-sm text-[#999]">This lead was deleted.</p>
      </Drawer>
    );
  }

  const set = <K extends keyof EditFormState>(key: K, value: EditFormState[K]) => setForm({ ...form, [key]: value });

  function startEditing() {
    setError("");
    setEditing(true);
  }

  function cancelEditing() {
    if (lead) setForm(toEditForm(lead));
    clearFormDraft();
    setError("");
    setEditing(false);
  }

  async function saveEdits() {
    if (!lead) return;
    setSavingEdits(true);
    setError("");
    try {
      const assignedEmployee = employees.find((e) => e.id === form.assignedTo);
      await updateLead(lead.id, {
        status: form.status,
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
        assignedTo: form.assignedTo || undefined,
        assignedToName: assignedEmployee?.name,
        followUpDate: form.followUpDate || undefined,
      });
      clearFormDraft();
      setEditing(false);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save changes"));
    } finally {
      setSavingEdits(false);
    }
  }

  async function handleAddNote() {
    if (!lead || !newNoteBody.trim() || !myId) return;
    setSavingNote(true);
    try {
      const now = new Date().toISOString();
      const note: LeadNote = {
        id: newNoteId(),
        leadId: lead.id,
        authorId: myId,
        authorName: myName,
        body: newNoteBody.trim(),
        recipientIds: [],
        createdAt: now,
        updatedAt: now,
      };
      await addLeadNote(note);
      setNewNoteBody("");
      clearNoteDraft();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to add note"));
    } finally {
      setSavingNote(false);
    }
  }

  async function handleDeleteNote(note: LeadNote) {
    if (!confirm("Delete this note?")) return;
    try {
      await removeLeadNote(note.id);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete note"));
    }
  }

  function toggleRecipient(note: LeadNote, employeeId: string) {
    const next = note.recipientIds.includes(employeeId)
      ? note.recipientIds.filter((id) => id !== employeeId)
      : [...note.recipientIds, employeeId];
    updateLeadNote(note.id, { recipientIds: next }).catch((err) => setError(getErrorMessage(err, "Failed to update sharing")));
  }

  const overdue = isFollowUpOverdue(lead.followUpDate, lead.status);
  const assignedEmployee = employees.find((e) => e.id === lead.assignedTo);

  const address = formatAddress(lead);

  // Only the fields that actually have something to show, in view mode,
  // a detail panel shouldn't pad out empty rows with dashes.
  const narrowDetailFields: { label: string; value: string; href?: string }[] = [
    lead.dba && { label: "DBA", value: lead.dba },
    lead.businessType && { label: "Business Type", value: lead.businessType },
    lead.pocName && { label: "Point of Contact", value: lead.pocName },
    lead.pocTitle && { label: "Title", value: lead.pocTitle },
    lead.phone && { label: "Phone", value: lead.phone },
    lead.email && { label: "Email", value: lead.email, href: `mailto:${lead.email}` },
    lead.companySize && { label: "Company Size", value: lead.companySize },
    lead.linkedinUrl && { label: "LinkedIn", value: "View profile", href: withScheme(lead.linkedinUrl) },
    lead.instagramUrl && { label: "Instagram", value: "View profile", href: withScheme(lead.instagramUrl) },
    lead.facebookUrl && { label: "Facebook", value: "View profile", href: withScheme(lead.facebookUrl) },
  ].filter((f): f is { label: string; value: string; href?: string } => Boolean(f));

  return (
    <Drawer
      open
      onClose={onClose}
      title={lead.companyName}
      subtitle={`Added ${formatTimestamp(lead.createdAt)}`}
      width="lg"
      footer={editing ? (
        <>
          <button
            onClick={cancelEditing}
            className="border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={saveEdits}
            disabled={savingEdits}
            className="flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
          >
            {savingEdits && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save Changes
          </button>
        </>
      ) : undefined}
    >
      {/* Toolbar: status badge + Edit, exactly matching the Edit Project
          header (static status pill, labeled black Edit button, no delete
          here, that only lives on the table row). */}
      <div className="flex items-center justify-end gap-2 pb-4 border-b border-[#f0f0f0] mb-5 -mt-1">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[lead.status]}`}>
          {STATUS_OPTIONS.find((s) => s.value === lead.status)?.label ?? lead.status}
        </span>
        {!editing && (
          <button
            onClick={startEditing}
            className="flex items-center gap-1.5 text-sm font-medium bg-[#0a0a0a] text-white px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        )}
      </div>

      {error && (
        <div className="mb-5 px-4 py-2.5 rounded-lg bg-[#fdeaea] text-[#f31260] text-sm">{error}</div>
      )}

      {/* Fields */}
      <div className="pb-5 mb-5 border-b border-[#f0f0f0]">
        {editing ? (
          <div className="space-y-4">
            <p className={sectionLabelClass}>Company Details</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Status">
                <Select
                  value={form.status}
                  onChange={(v) => set("status", v as LeadStatus)}
                  options={STATUS_OPTIONS}
                />
              </FormField>
              <FormField label="Company Size">
                <input value={form.companySize} onChange={(e) => set("companySize", e.target.value)} className={inputClass} placeholder="e.g. 11-50" />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="DBA">
                <input value={form.dba} onChange={(e) => set("dba", e.target.value)} className={inputClass} placeholder="Trade name, if different" />
              </FormField>
              <FormField label="Business Type">
                <input value={form.businessType} onChange={(e) => set("businessType", e.target.value)} className={inputClass} placeholder="e.g. HVAC Contractor" />
              </FormField>
            </div>
            <FormField label="Street">
              <input value={form.street} onChange={(e) => set("street", e.target.value)} className={inputClass} />
            </FormField>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="City">
                <input value={form.city} onChange={(e) => set("city", e.target.value)} className={inputClass} />
              </FormField>
              <FormField label="State">
                <input value={form.state} onChange={(e) => set("state", e.target.value)} className={inputClass} />
              </FormField>
              <FormField label="Zip Code">
                <input value={form.zip} onChange={(e) => set("zip", e.target.value)} className={inputClass} />
              </FormField>
            </div>

            <div className="border-t border-[#f7f7f7] pt-4">
              <p className={sectionLabelClass}>Contact</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Point of Contact">
                <input value={form.pocName} onChange={(e) => set("pocName", e.target.value)} className={inputClass} />
              </FormField>
              <FormField label="Title">
                <input value={form.pocTitle} onChange={(e) => set("pocTitle", e.target.value)} className={inputClass} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Phone">
                <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
              </FormField>
              <FormField label="Email">
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
              </FormField>
            </div>

            <div className="border-t border-[#f7f7f7] pt-4">
              <p className={sectionLabelClass}>Online Presence</p>
            </div>
            <FormField label="Website">
              <input value={form.website} onChange={(e) => set("website", e.target.value)} className={inputClass} placeholder="https://" />
            </FormField>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="LinkedIn">
                <input value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} className={inputClass} placeholder="linkedin.com/…" />
              </FormField>
              <FormField label="Instagram">
                <input value={form.instagramUrl} onChange={(e) => set("instagramUrl", e.target.value)} className={inputClass} placeholder="instagram.com/…" />
              </FormField>
              <FormField label="Facebook">
                <input value={form.facebookUrl} onChange={(e) => set("facebookUrl", e.target.value)} className={inputClass} placeholder="facebook.com/…" />
              </FormField>
            </div>

            <div className="border-t border-[#f7f7f7] pt-4">
              <p className={sectionLabelClass}>Assignment</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Assigned To">
                <Select
                  value={form.assignedTo}
                  onChange={(v) => set("assignedTo", v)}
                  placeholder="Unassigned"
                  options={employees.map((e) => ({ value: e.id, label: e.name }))}
                  clearable
                />
              </FormField>
              <FormField label="Follow Up By">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={form.followUpDate}
                    onChange={(e) => set("followUpDate", e.target.value)}
                    className={inputClass}
                  />
                  {overdue && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-[#f31260] shrink-0" title="Follow-up date has passed">
                      <AlertTriangle className="w-3 h-3" /> Overdue
                    </span>
                  )}
                </div>
              </FormField>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {narrowDetailFields.length === 0 && !address && !lead.website && (
              <p className="text-sm text-[#999]">No details yet, click Edit to add some.</p>
            )}

            {lead.website && (
              <ViewField label="Website" value={lead.website.replace(/^https?:\/\//, "")} href={withScheme(lead.website)} />
            )}

            {address && <ViewField label="Address" value={address} />}

            {narrowDetailFields.length > 0 && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {narrowDetailFields.map((f) => <ViewField key={f.label} {...f} />)}
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-4 border-t border-[#f5f5f5]">
              <ViewField label="Assigned To" value={assignedEmployee?.name ?? "Unassigned"} muted={!assignedEmployee} />
              <div>
                <p className={viewLabelClass}>Follow Up By</p>
                <p className={`text-sm truncate ${overdue ? "font-medium text-[#f31260]" : lead.followUpDate ? "font-medium text-[#0a0a0a]" : "text-[#bbb]"}`}>
                  {lead.followUpDate
                    ? new Date(lead.followUpDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "No date set"}
                  {overdue && <span className="ml-1.5 text-[10px] font-medium">(Overdue)</span>}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notes / activity */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4 text-[#999]" />
          <p className="text-sm font-semibold text-[#0a0a0a]">Notes</p>
          <span className="text-xs text-[#999]">({visibleNotes.length})</span>
        </div>

        <div className="space-y-3 mb-4">
          {visibleNotes.length === 0 && (
            <p className="text-xs text-[#999]">No notes yet, private notes stay just for you unless you share them.</p>
          )}
          {visibleNotes.map((n) => {
            const isMine = n.authorId === myId;
            const colors = getAvatarColor(n.authorName);
            const sharedWith = employees.filter((e) => n.recipientIds.includes(e.id));
            return (
              <div key={n.id} className="border border-[#eaeaea] rounded-lg p-3">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-6 h-6 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center shrink-0`}>
                      <span className="text-[9px] font-semibold">{getInitials(n.authorName)}</span>
                    </div>
                    <p className="text-xs font-medium text-[#0a0a0a] truncate">{isMine ? "You" : n.authorName}</p>
                    <p className="text-[10px] text-[#bbb] shrink-0">{formatTimestamp(n.updatedAt)}</p>
                  </div>
                  {isMine && (
                    <div className="flex items-center gap-1 shrink-0 relative">
                      {sharedWith.length > 0 && (
                        <div className="flex items-center -space-x-1 mr-1">
                          {sharedWith.slice(0, 3).map((e) => {
                            const c = getAvatarColor(e.name);
                            return (
                              <div key={e.id} title={e.name} className={`w-4.5 h-4.5 rounded-full ${c.bg} ${c.text} border border-white flex items-center justify-center`}>
                                <span className="text-[7px] font-semibold">{getInitials(e.name)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <button onClick={() => setShareOpenFor(shareOpenFor === n.id ? null : n.id)} className="p-1 rounded hover:bg-[#f5f5f5] text-[#999] hover:text-[#0070f3] transition-colors" title="Share with teammates">
                        <Send className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDeleteNote(n)} className="p-1 rounded hover:bg-[#fff0f3] text-[#999] hover:text-[#f31260] transition-colors" title="Delete note">
                        <Trash2 className="w-3 h-3" />
                      </button>
                      {shareOpenFor === n.id && (
                        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-[#eaeaea] rounded-xl shadow-lg z-20 p-2">
                          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest px-2 py-1.5">Share with</p>
                          <div className="max-h-48 overflow-y-auto space-y-0.5">
                            {employees.filter((e) => e.id !== myId).map((e) => {
                              const checked = n.recipientIds.includes(e.id);
                              const c = getAvatarColor(e.name);
                              return (
                                <button key={e.id} onClick={() => toggleRecipient(n, e.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors text-left">
                                  <div className={`w-5 h-5 rounded-full ${c.bg} ${c.text} flex items-center justify-center shrink-0`}>
                                    <span className="text-[8px] font-semibold">{getInitials(e.name)}</span>
                                  </div>
                                  <span className="text-xs text-[#0a0a0a] flex-1 truncate">{e.name}</span>
                                  {checked && <Check className="w-3.5 h-3.5 text-[#0070f3] shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-sm text-[#333] whitespace-pre-wrap leading-relaxed">{n.body}</p>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          <textarea
            value={newNoteBody}
            onChange={(e) => setNewNoteBody(e.target.value)}
            placeholder="Add a note… only you can see it until you share it"
            className="w-full min-h-20 resize-none text-sm border border-[#eaeaea] rounded-lg px-3 py-2 outline-none focus:border-[#0070f3] transition-colors"
          />
          <button
            onClick={handleAddNote}
            disabled={savingNote || !newNoteBody.trim()}
            className="self-end flex items-center gap-2 text-sm bg-[#0070f3] text-white font-medium px-4 py-1.5 rounded-lg hover:bg-[#005fcc] transition-colors disabled:opacity-50"
          >
            {savingNote && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Add Note
          </button>
        </div>
      </div>
    </Drawer>
  );
}
