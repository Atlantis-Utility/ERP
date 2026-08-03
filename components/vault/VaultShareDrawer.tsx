"use client";

import { useEffect, useMemo, useState } from "react";
import { X, UserPlus } from "lucide-react";
import VaultModal from "@/components/vault/VaultModal";
import Select from "@/components/ui/Select";
import { useEmployees } from "@/lib/db/employees";
import { listVaultShares, grantVaultShare, revokeVaultShare } from "@/lib/db/vault";
import { getAvatarColor, getInitials, formatDate } from "@/lib/utils";
import type { VaultEntryMeta, VaultShareInfo } from "@/lib/vault-types";

interface Props {
  open: boolean;
  entry: VaultEntryMeta | null;
  onClose: () => void;
}

export default function VaultShareDrawer({ open, entry, onClose }: Props) {
  const employees = useEmployees();
  const [shares, setShares] = useState<VaultShareInfo[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingUid, setRemovingUid] = useState<string | null>(null);

  async function load() {
    if (!entry) return;
    setLoading(true);
    setError("");
    try {
      const res = await listVaultShares(entry.id);
      setShares(res.shares);
      setIsOwner(res.isOwner);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load access list");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && entry) load();
    setSelectedEmployeeId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id]);

  const grantedEmails = useMemo(() => new Set(shares.map((s) => s.granteeEmail.toLowerCase())), [shares]);
  const employeeOptions = useMemo(
    () =>
      employees
        .filter((e) => !grantedEmails.has(e.email.toLowerCase()))
        .map((e) => ({ value: e.id, label: `${e.name} · ${e.email}` })),
    [employees, grantedEmails]
  );

  async function handleGrant() {
    if (!entry || !selectedEmployeeId) return;
    setAdding(true);
    setError("");
    try {
      await grantVaultShare(entry.id, selectedEmployeeId);
      setSelectedEmployeeId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share entry");
    } finally {
      setAdding(false);
    }
  }

  async function handleRevoke(granteeUid: string) {
    if (!entry) return;
    setRemovingUid(granteeUid);
    try {
      await revokeVaultShare(entry.id, granteeUid);
      setShares((prev) => prev.filter((s) => s.granteeUid !== granteeUid));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke access");
    } finally {
      setRemovingUid(null);
    }
  }

  if (!entry) return null;

  return (
    <VaultModal open={open} onClose={onClose} title="Manage Access" subtitle={entry.name}>
      <div className="space-y-5">
        {error && (
          <div className="border border-[#fecdd3] bg-[#fef2f2] text-[#b91c1c] text-xs rounded-lg px-3 py-2.5">{error}</div>
        )}

        {isOwner && (
          <div>
            <p className="text-[10px] font-medium text-[#999] uppercase tracking-wider mb-1.5">Share with</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <Select
                  value={selectedEmployeeId}
                  onChange={setSelectedEmployeeId}
                  options={employeeOptions}
                  placeholder="Select an employee..."
                />
              </div>
              <button
                onClick={handleGrant}
                disabled={!selectedEmployeeId || adding}
                className="shrink-0 flex items-center gap-1.5 bg-[#0a0a0a] text-white text-xs font-medium px-3 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-40"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
            <p className="text-[10px] text-[#bbb] mt-1.5">They&rsquo;ll be able to view and reveal this password, not edit or re-share it.</p>
          </div>
        )}

        <div>
          <p className="text-[10px] font-medium text-[#999] uppercase tracking-wider mb-1.5">
            Has access {shares.length > 0 && `(${shares.length})`}
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-4 h-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : shares.length === 0 ? (
            <p className="text-xs text-[#bbb]">Not shared with anyone else yet.</p>
          ) : (
            <div className="space-y-1.5">
              {shares.map((s) => {
                const c = getAvatarColor(s.granteeName || s.granteeEmail);
                return (
                  <div key={s.granteeUid} className="flex items-center gap-3 border border-[#eaeaea] rounded-lg px-3 py-2.5">
                    <div className={`w-7 h-7 rounded-full ${c.bg} ${c.text} flex items-center justify-center shrink-0`}>
                      <span className="text-[10px] font-semibold">{getInitials(s.granteeName || s.granteeEmail)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[#0a0a0a] truncate">{s.granteeName || s.granteeEmail}</p>
                      <p className="text-[10px] text-[#999] truncate">
                        Added {formatDate(s.grantedAt)}{s.grantedByName ? ` by ${s.grantedByName}` : ""}
                      </p>
                    </div>
                    {isOwner && (
                      <button
                        onClick={() => handleRevoke(s.granteeUid)}
                        disabled={removingUid === s.granteeUid}
                        title="Revoke access"
                        className="shrink-0 p-1.5 rounded-md text-[#999] hover:bg-[#fef2f2] hover:text-[#dc2626] transition-colors disabled:opacity-40"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </VaultModal>
  );
}
