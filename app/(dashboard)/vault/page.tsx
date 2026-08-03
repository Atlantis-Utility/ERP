"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, Plus, Search, ShieldCheck, Lock, Users, Share2, Building2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Select from "@/components/ui/Select";
import {
  listVaultEntries, createVaultEntry, updateVaultEntry, deleteVaultEntry,
  lockVault, isVaultLockedError,
} from "@/lib/db/vault";
import { VAULT_CATEGORIES } from "@/lib/vault-types";
import type { VaultCategory, VaultEntryMeta } from "@/lib/vault-types";
import { logActivity } from "@/lib/activity-log";
import VaultFormDrawer, { type VaultFormValues } from "@/components/vault/VaultFormDrawer";
import VaultDetailDrawer from "@/components/vault/VaultDetailDrawer";
import VaultShareDrawer from "@/components/vault/VaultShareDrawer";
import VaultUnlockGate from "@/components/vault/VaultUnlockGate";

const CATEGORY_STYLES: Record<VaultCategory, { bg: string; text: string }> = {
  infrastructure: { bg: "bg-[#eff6ff]", text: "text-[#1d4ed8]" },
  hosting:        { bg: "bg-[#f0fdf4]", text: "text-[#16a34a]" },
  software:       { bg: "bg-[#faf5ff]", text: "text-[#7e22ce]" },
  email:          { bg: "bg-[#fffbeb]", text: "text-[#b45309]" },
  domain:         { bg: "bg-[#ecfeff]", text: "text-[#0e7490]" },
  financial:      { bg: "bg-[#fef2f2]", text: "text-[#b91c1c]" },
  social:         { bg: "bg-[#fdf2f8]", text: "text-[#be185d]" },
  networking:     { bg: "bg-[#f5f3ff]", text: "text-[#6d28d9]" },
  other:          { bg: "bg-[#f5f5f5]", text: "text-[#666]"    },
};

function categoryLabel(c: VaultCategory): string {
  return VAULT_CATEGORIES.find((x) => x.value === c)?.label ?? "Other";
}

export default function VaultPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [entries, setEntries] = useState<VaultEntryMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | VaultCategory>("all");

  const [showAdd, setShowAdd] = useState(false);
  const [editingEntry, setEditingEntry] = useState<VaultEntryMeta | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<VaultEntryMeta | null>(null);
  const [sharingEntry, setSharingEntry] = useState<VaultEntryMeta | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listVaultEntries());
    } catch (err) {
      if (isVaultLockedError(err)) { setUnlocked(false); return; }
      setError(err instanceof Error ? err.message : "Failed to load vault");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (unlocked) load();
  }, [unlocked]);

  async function handleLock() {
    await lockVault().catch(() => {});
    setUnlocked(false);
    setEntries([]);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      const matchesSearch =
        !q ||
        e.name.toLowerCase().includes(q) ||
        (e.accountId ?? "").toLowerCase().includes(q) ||
        (e.email ?? "").toLowerCase().includes(q) ||
        (e.website ?? "").toLowerCase().includes(q) ||
        (e.customerName ?? "").toLowerCase().includes(q) ||
        e.pointsOfContact.some((p) => p.toLowerCase().includes(q));
      const matchesCategory = categoryFilter === "all" || e.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [entries, search, categoryFilter]);

  async function handleCreate(data: VaultFormValues) {
    const entry = await createVaultEntry({
      name: data.name.trim(),
      category: data.category,
      accountId: data.accountId.trim() || undefined,
      email: data.email.trim() || undefined,
      password: data.password,
      pin: data.pin || undefined,
      website: data.website.trim() || undefined,
      phoneNumbers: data.phoneNumbers.map((p) => p.trim()).filter(Boolean),
      pointsOfContact: data.pointsOfContact.map((p) => p.trim()).filter(Boolean),
      customerId: data.customerId || undefined,
      customerName: data.customerName || undefined,
      notes: data.notes.trim() || undefined,
      tags: data.tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setEntries((prev) => [...prev, entry].sort((a, b) => a.name.localeCompare(b.name)));
    logActivity({ category: "access", action: "Vault entry added", detail: `"${entry.name}" was added to the password vault.` });
  }

  async function handleUpdate(data: VaultFormValues) {
    if (!editingEntry) return;
    const updated = await updateVaultEntry(editingEntry.id, {
      name: data.name.trim(),
      category: data.category,
      accountId: data.accountId.trim() || undefined,
      email: data.email.trim() || undefined,
      password: data.password || undefined,
      pin: data.pin || undefined,
      website: data.website.trim() || undefined,
      phoneNumbers: data.phoneNumbers.map((p) => p.trim()).filter(Boolean),
      pointsOfContact: data.pointsOfContact.map((p) => p.trim()).filter(Boolean),
      customerId: data.customerId || null,
      customerName: data.customerName || null,
      notes: data.notes.trim() || undefined,
      tags: data.tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? { ...updated, shareCount: e.shareCount } : e)).sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedEntry((prev) => (prev?.id === updated.id ? { ...updated, shareCount: prev.shareCount } : prev));
    logActivity({ category: "access", action: "Vault entry updated", detail: `"${updated.name}" was updated in the password vault.` });
  }

  async function handleDelete(entry: VaultEntryMeta) {
    await deleteVaultEntry(entry.id);
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    logActivity({ category: "access", action: "Vault entry deleted", detail: `"${entry.name}" was removed from the password vault.` });
  }

  if (!unlocked) {
    return (
      <div>
        <Header title="Password Vault" subtitle="Company credential storage" />
        <VaultUnlockGate onUnlocked={() => setUnlocked(true)} />
      </div>
    );
  }

  return (
    <div>
      <Header
        title="Password Vault"
        subtitle={`${entries.length} stored credential${entries.length === 1 ? "" : "s"} · encrypted at rest`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleLock}
              className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-3 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
              title="Lock your vault for this session"
            >
              <Lock className="w-3.5 h-3.5" />
              Lock
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Key
            </button>
          </div>
        }
      />

      <div className="flex items-center gap-2 mb-4 text-[11px] text-[#999]">
        <ShieldCheck className="w-3.5 h-3.5 text-[#17c964]" />
        Encrypted at rest. Each entry is only visible to its owner, an admin, and anyone it&rsquo;s been explicitly shared with.
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-[#bbb] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="w-full border border-[#eaeaea] rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#0070f3] transition-colors bg-white"
            placeholder="Search by name, ID, email, website, company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-48">
          <Select
            value={categoryFilter}
            onChange={(v) => setCategoryFilter(v as "all" | VaultCategory)}
            options={[{ value: "all", label: "All Categories" }, ...VAULT_CATEGORIES]}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between border border-[#fecdd3] bg-[#fef2f2] text-[#b91c1c] text-sm rounded-lg px-4 py-3 mb-4">
          <span>{error}</span>
          <button onClick={load} className="text-xs font-medium underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center border border-dashed border-[#eaeaea] rounded-xl py-20">
          <KeyRound className="w-8 h-8 text-[#ccc] mb-3" />
          <p className="text-sm font-medium text-[#0a0a0a]">
            {entries.length === 0 ? "No credentials stored yet" : "No matches"}
          </p>
          <p className="text-xs text-[#999] mt-1">
            {entries.length === 0 ? "Add your first company credential to get started." : "Try a different search or category."}
          </p>
        </div>
      ) : (
        <div className="border border-[#eaeaea] rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#eaeaea] bg-[#fafafa] text-left">
                <th className="px-4 py-2.5 text-[10px] font-semibold text-[#999] uppercase tracking-wider">Name</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-[#999] uppercase tracking-wider">ID / Email</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-[#999] uppercase tracking-wider">Company</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-[#999] uppercase tracking-wider">Access</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-[#999] uppercase tracking-wider">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const cat = CATEGORY_STYLES[entry.category];
                return (
                  <tr
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className="border-b border-[#f5f5f5] last:border-0 hover:bg-[#fafafa] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#0a0a0a]">{entry.name}</p>
                      <span className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${cat.bg} ${cat.text}`}>
                        {categoryLabel(entry.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#666]">
                      {entry.accountId || entry.email || <span className="text-[#ccc]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[#666]">
                      {entry.customerName ? (
                        <span className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-[#bbb]" />
                          <span className="truncate max-w-40">{entry.customerName}</span>
                        </span>
                      ) : (
                        <span className="text-[#ccc]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#666]">
                      {entry.isOwner ? (
                        entry.shareCount ? (
                          <span className="flex items-center gap-1.5 text-xs">
                            <Users className="w-3.5 h-3.5 text-[#bbb]" />
                            Shared ({entry.shareCount})
                          </span>
                        ) : (
                          <span className="text-xs text-[#bbb]">Only you</span>
                        )
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs">
                          <Share2 className="w-3.5 h-3.5 text-[#bbb]" />
                          {entry.isAdminView ? entry.ownerName || "Another employee" : `Shared by ${entry.ownerName || "owner"}`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#999] text-xs">{new Date(entry.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <VaultFormDrawer open={showAdd} onClose={() => setShowAdd(false)} onSave={handleCreate} />

      <VaultFormDrawer
        open={!!editingEntry}
        onClose={() => setEditingEntry(null)}
        entry={editingEntry ?? undefined}
        onSave={handleUpdate}
      />

      <VaultDetailDrawer
        open={!!selectedEntry}
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
        onEdit={(entry) => { setSelectedEntry(null); setEditingEntry(entry); }}
        onDelete={handleDelete}
        onManageAccess={(entry) => { setSelectedEntry(null); setSharingEntry(entry); }}
      />

      <VaultShareDrawer
        open={!!sharingEntry}
        entry={sharingEntry}
        onClose={() => setSharingEntry(null)}
      />
    </div>
  );
}
