"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { BookUser, Mail, Smartphone, Phone, RefreshCw, AlertCircle, Plus, X, Trash2 } from "lucide-react";

interface Contact {
  domain: string;
  user: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  company?: string;
  work_phone?: string;
  cell_phone?: string;
  home_phone?: string;
  email?: string;
  tags?: string;
  contact_id?: string;
  ts?: string;
}

interface Customer {
  domain: string;
  [key: string]: unknown;
}

type ViewState = "idle" | "loading" | "unconfigured" | "error" | "ok";

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  company: "",
  work_phone: "",
  cell_phone: "",
  email: "",
};

export default function ContactsPage() {
  const [state, setState] = useState<ViewState>("idle");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [domain, setDomain] = useState("");
  const [user, setUser] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetch("/api/ringlogix/customers")
      .then((r) => r.json())
      .then((d) => {
        const arr: Customer[] = Array.isArray(d) ? d : (d?.data ?? []);
        setCustomers(arr);
        if (arr.length > 0) setDomain(arr[0].domain);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!domain || !user) return;
    setState("loading");
    try {
      const res = await fetch(`/api/ringlogix/contacts?domain=${encodeURIComponent(domain)}&user=${encodeURIComponent(user)}`);
      if (res.status === 503) { setState("unconfigured"); return; }
      const data = await res.json();
      if (data?.error === "not_configured") { setState("unconfigured"); return; }
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const arr: Contact[] = Array.isArray(data) ? data : (data?.data ?? []);
      setContacts(arr);
      setState("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setState("error");
    }
  }, [domain, user]);

  const deleteContact = async (c: Contact) => {
    if (!confirm(`Delete ${c.first_name} ${c.last_name}?`)) return;
    try {
      const res = await fetch("/api/ringlogix/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: c.domain,
          user: c.user,
          first_name: c.first_name,
          last_name: c.last_name,
          contact_id: c.contact_id,
        }),
      });
      if (res.ok) setContacts((prev) => prev.filter((x) => x.contact_id !== c.contact_id));
    } catch {}
  };

  const addContact = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setSaveError("First and last name are required.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/ringlogix/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, domain, user }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to add contact");
      }
      setShowModal(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to add contact");
    } finally {
      setSaving(false);
    }
  };

  const withEmail = contacts.filter((c) => Boolean(c.email)).length;
  const withMobile = contacts.filter((c) => Boolean(c.cell_phone)).length;
  const withWork = contacts.filter((c) => Boolean(c.work_phone)).length;

  const filtered = contacts.filter((c) => {
    const term = search.toLowerCase();
    return (
      c.first_name?.toLowerCase().includes(term) ||
      c.last_name?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term) ||
      c.company?.toLowerCase().includes(term)
    );
  });

  return (
    <div>
      <Header
        title="Contacts"
        subtitle={state === "ok" ? `${contacts.length} contact${contacts.length !== 1 ? "s" : ""}` : "Manage RingLogix contacts"}
        actions={
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#0070f3] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#005fcc] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Contact
          </button>
        }
      />

      {/* Domain + User selector */}
      <div className="bg-white border border-[#eaeaea] rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Domain</label>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors min-w-[180px] bg-white"
          >
            <option value="">Select domain…</option>
            {customers.map((c) => (
              <option key={c.domain} value={c.domain}>{c.domain}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">User / Extension</label>
          <input
            type="text"
            placeholder="e.g. 1001"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors w-36"
          />
        </div>
        <button
          onClick={load}
          disabled={!domain || !user || state === "loading"}
          className="flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-4 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${state === "loading" ? "animate-spin" : ""}`} />
          Load
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <BookUser className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? contacts.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total</p>
          <p className="text-xs text-[#999]">All contacts</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Mail className="w-4 h-4 text-[#17c964]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? withEmail : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">With Email</p>
          <p className="text-xs text-[#999]">Email address on file</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Smartphone className="w-4 h-4 text-[#7c3aed]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? withMobile : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">With Mobile</p>
          <p className="text-xs text-[#999]">Cell phone on file</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Phone className="w-4 h-4 text-[#f5a524]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? withWork : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">With Work Phone</p>
          <p className="text-xs text-[#999]">Work number on file</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">All Contacts</p>
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-64 outline-none focus:border-[#0070f3] transition-colors"
          />
        </div>

        {state === "idle" && (
          <div className="p-12 text-center">
            <BookUser className="w-6 h-6 text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Select a domain and user, then click Load.</p>
          </div>
        )}

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Loading contacts…</p>
          </div>
        )}

        {state === "unconfigured" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f5a524] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">API not configured</p>
            <p className="text-xs text-[#999]">Add your key to <code className="bg-[#f1f1f1] px-1 rounded">.env.local</code> as <code className="bg-[#f1f1f1] px-1 rounded">RINGLOGIX_API_ID & RINGLOGIX_API_SECRET</code>, then restart the server.</p>
          </div>
        )}

        {state === "error" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f31260] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">Failed to load</p>
            <p className="text-xs text-[#999] mb-4">{error}</p>
            <button onClick={load} className="text-xs text-[#0070f3] hover:underline">Retry</button>
          </div>
        )}

        {state === "ok" && filtered.length === 0 && (
          <div className="p-12 text-center">
            <BookUser className="w-6 h-6 text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#999]">No contacts found{search ? " for that search" : ""}.</p>
          </div>
        )}

        {state === "ok" && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#eaeaea] bg-[#fafafa]">
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Name</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Company</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Work Phone</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Cell Phone</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Home Phone</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Email</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Tags</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={(c.contact_id ?? "") + i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#e8f2ff] flex items-center justify-center shrink-0">
                          <BookUser className="w-3.5 h-3.5 text-[#0070f3]" />
                        </div>
                        <span className="text-sm font-medium text-[#0a0a0a]">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "-"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666]">{c.company || "-"}</td>
                    <td className="px-4 py-3 text-sm text-[#666] font-mono">{c.work_phone || "-"}</td>
                    <td className="px-4 py-3 text-sm text-[#666] font-mono">{c.cell_phone || "-"}</td>
                    <td className="px-4 py-3 text-sm text-[#666] font-mono">{c.home_phone || "-"}</td>
                    <td className="px-4 py-3 text-sm text-[#666]">{c.email || "-"}</td>
                    <td className="px-4 py-3">
                      {c.tags ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#f1f1f1] text-[#666]">{c.tags}</span>
                      ) : (
                        <span className="text-sm text-[#999]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteContact(c)}
                        className="p-1.5 rounded-lg text-[#999] hover:text-[#f31260] hover:bg-[#fff0f3] transition-colors"
                        title="Delete contact"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#eaeaea]">
              <p className="text-sm font-semibold text-[#0a0a0a]">Add Contact</p>
              <button onClick={() => { setShowModal(false); setSaveError(""); }} className="p-1 rounded-lg hover:bg-[#f5f5f5] transition-colors text-[#999]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">First Name *</label>
                  <input type="text" value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Last Name *</label>
                  <input type="text" value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Company</label>
                <input type="text" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors w-full" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Work Phone</label>
                <input type="text" value={form.work_phone} onChange={(e) => setForm((f) => ({ ...f, work_phone: e.target.value }))} className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors w-full" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Cell Phone</label>
                <input type="text" value={form.cell_phone} onChange={(e) => setForm((f) => ({ ...f, cell_phone: e.target.value }))} className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors w-full" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors w-full" />
              </div>
              {saveError && <p className="text-xs text-[#f31260]">{saveError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#eaeaea]">
              <button onClick={() => { setShowModal(false); setSaveError(""); }} className="text-sm border border-[#eaeaea] bg-white text-[#0a0a0a] font-medium px-4 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors">Cancel</button>
              <button onClick={addContact} disabled={saving} className="text-sm bg-[#0070f3] text-white font-medium px-4 py-1.5 rounded-lg hover:bg-[#005fcc] transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Add Contact
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
