"use client";

import { useState } from "react";
import Header from "@/components/layout/Header";
import Select from "@/components/ui/Select";
import ImportLeadsCsvModal from "@/components/leads/ImportLeadsCsvModal";
import LeadFormModal from "@/components/leads/LeadFormModal";
import LeadDetailDrawer from "@/components/leads/LeadDetailDrawer";
import StatusPicker from "@/components/leads/StatusPicker";
import { useAuth } from "@/lib/auth-context";
import { useEmployees } from "@/lib/db/employees";
import { useLeads, removeLead, updateLead, type Lead, type LeadStatus } from "@/lib/db/leads";
import { STATUS_OPTIONS, isFollowUpOverdue, formatAddress } from "@/lib/leads-constants";
import { getAvatarColor, getInitials } from "@/lib/utils";
import {
  Target, Plus, FileSpreadsheet, Building2, Trash2, ExternalLink, AlertTriangle, User,
} from "lucide-react";

const SOURCE_LABELS = { azure_maps: "Azure Maps", linkedin_csv: "LinkedIn", manual: "Manual" } as const;

export default function LeadsPage() {
  const { authUser } = useAuth();
  const employees = useEmployees();
  const leads = useLeads();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  const myId = authUser?.employeeId ?? "";

  const filtered = leads.filter((l) => {
    if (statusFilter && l.status !== statusFilter) return false;
    if (assigneeFilter && l.assignedTo !== assigneeFilter) return false;
    const term = search.toLowerCase();
    if (!term) return true;
    return (
      l.companyName?.toLowerCase().includes(term) ||
      l.dba?.toLowerCase().includes(term) ||
      l.pocName?.toLowerCase().includes(term) ||
      l.businessType?.toLowerCase().includes(term) ||
      formatAddress(l).toLowerCase().includes(term)
    );
  });

  const withPoc = leads.filter((l) => Boolean(l.pocName)).length;
  const withWebsite = leads.filter((l) => Boolean(l.website)).length;
  const converted = leads.filter((l) => l.status === "converted").length;

  async function deleteLead(l: Lead) {
    if (!confirm(`Delete lead "${l.companyName}"?`)) return;
    await removeLead(l.id);
  }

  async function setStatus(l: Lead, status: LeadStatus) {
    await updateLead(l.id, { status });
  }

  return (
    <div>
      <Header
        title="Leads"
        subtitle={`${leads.length} lead${leads.length !== 1 ? "s" : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Import CSV
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 bg-[#0070f3] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#005fcc] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Lead
            </button>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:flex md:items-stretch md:divide-x divide-[#f4f4f4] bg-white border border-[#eaeaea] rounded-xl mb-5 overflow-hidden">
        {[
          { label: "Total Leads", value: leads.length },
          { label: "With Point of Contact", value: withPoc },
          { label: "With Website", value: withWebsite },
          { label: "Converted", value: converted },
        ].map((k, i, arr) => (
          <div key={k.label} className={`px-4 py-4 md:flex-1 md:px-5 md:py-5 ${i < arr.length - 1 ? "border-b md:border-b-0 border-[#f4f4f4]" : ""}`}>
            <p className="text-2xl font-bold tabular-nums leading-none text-[#0a0a0a]">{k.value}</p>
            <p className="text-[11px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">All Leads</p>
          <div className="flex items-center gap-2">
            {myId && (
              <button
                onClick={() => setAssigneeFilter((f) => (f === myId ? "" : myId))}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  assigneeFilter === myId ? "border-[#0070f3] bg-[#e8f2ff] text-[#0070f3]" : "border-[#eaeaea] text-[#666] hover:bg-[#fafafa]"
                }`}
              >
                <User className="w-3.5 h-3.5" /> My Leads
              </button>
            )}
            <div className="w-40">
              <Select
                value={assigneeFilter}
                onChange={setAssigneeFilter}
                placeholder="All assignees"
                options={employees.map((e) => ({ value: e.id, label: e.name }))}
                clearable
              />
            </div>
            <div className="w-40">
              <Select value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" options={STATUS_OPTIONS} clearable />
            </div>
            <input
              type="text"
              placeholder="Search company, contact, address…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-64 outline-none focus:border-[#0070f3] transition-colors"
            />
          </div>
        </div>

        {leads.length === 0 && (
          <div className="p-12 text-center">
            <Target className="w-6 h-6 text-[#999] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">No leads yet</p>
            <p className="text-xs text-[#999]">Import a CSV or add one manually.</p>
          </div>
        )}

        {leads.length > 0 && filtered.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-sm text-[#999]">No leads match that filter.</p>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#eaeaea] bg-[#fafafa]">
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Company</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Point of Contact</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Phone / Website</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Location</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Assigned</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Follow-up</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const overdue = isFollowUpOverdue(l.followUpDate, l.status);
                  return (
                    <tr key={l.id} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                      <td className="px-4 py-3">
                        <button onClick={() => setOpenLeadId(l.id)} className="flex items-center gap-2.5 text-left">
                          <div className="w-7 h-7 rounded-lg bg-[#e8f2ff] flex items-center justify-center shrink-0">
                            <Building2 className="w-3.5 h-3.5 text-[#0070f3]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[#0a0a0a] truncate hover:text-[#0070f3] transition-colors">
                              {l.companyName}{l.dba && <span className="text-[#999] font-normal"> (DBA {l.dba})</span>}
                            </p>
                            <p className="text-[10px] text-[#bbb]">{l.businessType || SOURCE_LABELS[l.source]}</p>
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-[#0a0a0a]">{l.pocName || "-"}</p>
                        {l.pocTitle && <p className="text-xs text-[#999]">{l.pocTitle}</p>}
                        {l.linkedinUrl && (
                          <a href={l.linkedinUrl} target="_blank" rel="noreferrer" className="text-xs text-[#0070f3] hover:underline flex items-center gap-1 mt-0.5">
                            <ExternalLink className="w-3 h-3" /> LinkedIn
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#666]">
                        <p className="font-mono">{l.phone || "-"}</p>
                        {l.website && (
                          <a href={l.website} target="_blank" rel="noreferrer" className="text-xs text-[#0070f3] hover:underline truncate block max-w-40">
                            {l.website.replace(/^https?:\/\//, "")}
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#666] max-w-40 truncate">
                        {[l.city, l.state].filter(Boolean).join(", ") || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {l.assignedToName ? (
                          <div className="flex items-center gap-1.5">
                            <div className={`w-5 h-5 rounded-full ${getAvatarColor(l.assignedToName).bg} ${getAvatarColor(l.assignedToName).text} flex items-center justify-center shrink-0`}>
                              <span className="text-[8px] font-semibold">{getInitials(l.assignedToName)}</span>
                            </div>
                            <span className="text-xs text-[#666] truncate">{l.assignedToName}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-[#ccc]">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {l.followUpDate ? (
                          <span className={`flex items-center gap-1 text-xs ${overdue ? "text-[#f31260] font-medium" : "text-[#666]"}`}>
                            {overdue && <AlertTriangle className="w-3 h-3" />}
                            {new Date(l.followUpDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        ) : (
                          <span className="text-sm text-[#ccc]">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPicker value={l.status} onChange={(status) => setStatus(l, status)} />
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => deleteLead(l)} className="p-1.5 rounded-lg text-[#999] hover:text-[#f31260] hover:bg-[#fff0f3] transition-colors" title="Delete lead">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showImport && <ImportLeadsCsvModal onClose={() => setShowImport(false)} onImported={() => {}} existingLeads={leads} />}
      {showAdd && <LeadFormModal onClose={() => setShowAdd(false)} onSaved={() => {}} />}
      {openLeadId && <LeadDetailDrawer leadId={openLeadId} onClose={() => setOpenLeadId(null)} />}
    </div>
  );
}
