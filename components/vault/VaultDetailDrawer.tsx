"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Copy, Check, ExternalLink, Pencil, Trash2, Mail, Phone, User, Clock, Users, Share2, Building2, Hash } from "lucide-react";
import VaultModal from "@/components/vault/VaultModal";
import { VAULT_CATEGORIES } from "@/lib/vault-types";
import type { VaultEntryMeta } from "@/lib/vault-types";
import { revealVaultPassword } from "@/lib/db/vault";
import { copyWithAutoClear } from "@/lib/vault-client-utils";
import { formatDate } from "@/lib/utils";

const AUTO_HIDE_MS = 20_000;

interface Props {
  open: boolean;
  entry: VaultEntryMeta | null;
  onClose: () => void;
  onEdit: (entry: VaultEntryMeta) => void;
  onDelete: (entry: VaultEntryMeta) => Promise<void>;
  onManageAccess: (entry: VaultEntryMeta) => void;
}

function Row({ icon: Icon, label, value, href }: { icon: React.ElementType; label: string; value?: string; href?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#f5f5f5] last:border-0">
      <Icon className="w-3.5 h-3.5 text-[#999] mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium text-[#999] uppercase tracking-wider">{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-[#0070f3] hover:underline truncate flex items-center gap-1 mt-0.5">
            {value} <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        ) : (
          <p className="text-sm text-[#0a0a0a] truncate mt-0.5">{value}</p>
        )}
      </div>
    </div>
  );
}

// Same layout as Row, but for a field that can have more than one value
// (phone numbers, points of contact), renders each on its own line.
function RowList({ icon: Icon, label, values }: { icon: React.ElementType; label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#f5f5f5] last:border-0">
      <Icon className="w-3.5 h-3.5 text-[#999] mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium text-[#999] uppercase tracking-wider">{label}</p>
        <div className="mt-0.5 space-y-0.5">
          {values.map((v, i) => (
            <p key={i} className="text-sm text-[#0a0a0a] truncate">{v}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function VaultDetailDrawer({ open, entry, onClose, onEdit, onDelete, onManageAccess }: Props) {
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [revealedPin, setRevealedPin] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [copied, setCopied] = useState<"password" | "pin" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRevealedPassword(null);
    setRevealedPin(null);
    setCopied(null);
    setConfirmDelete(false);
    setError(null);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, [entry, open]);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  if (!entry) return null;

  function armAutoHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { setRevealedPassword(null); setRevealedPin(null); }, AUTO_HIDE_MS);
  }

  // One reveal call returns both secrets, no need for a second round trip
  // just because the PIN's toggle is clicked after the password's already showing.
  async function ensureRevealed(): Promise<{ password: string; pin: string | null }> {
    if (revealedPassword !== null) return { password: revealedPassword, pin: revealedPin };
    const res = await revealVaultPassword(entry!.id);
    setRevealedPassword(res.password);
    setRevealedPin(res.pin);
    armAutoHide();
    return res;
  }

  async function handleTogglePassword() {
    if (revealedPassword) { setRevealedPassword(null); return; }
    setRevealing(true);
    setError(null);
    try {
      await ensureRevealed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reveal password");
    } finally {
      setRevealing(false);
    }
  }

  async function handleTogglePin() {
    if (revealedPin) { setRevealedPin(null); return; }
    setRevealing(true);
    setError(null);
    try {
      await ensureRevealed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reveal PIN");
    } finally {
      setRevealing(false);
    }
  }

  async function handleCopy(field: "password" | "pin") {
    setRevealing(true);
    setError(null);
    try {
      const res = await ensureRevealed();
      const value = field === "password" ? res.password : res.pin;
      if (!value) return;
      await copyWithAutoClear(value);
      setCopied(field);
      setTimeout(() => setCopied((c) => (c === field ? null : c)), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to copy ${field}`);
    } finally {
      setRevealing(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(entry!);
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  const category = VAULT_CATEGORIES.find((c) => c.value === entry.category);
  const canManage = entry.isOwner || entry.isAdminView;

  return (
    <VaultModal
      open={open}
      onClose={onClose}
      title={entry.name}
      subtitle={category?.label ?? "Other"}
      footer={
        !canManage ? undefined : confirmDelete ? (
          <>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-[#f31260] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#d10e54] transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Confirm Delete"}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-sm font-medium text-[#f31260] px-4 py-2 rounded-lg hover:bg-[#fff0f5] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
            <button
              onClick={() => onEdit(entry)}
              className="flex items-center gap-1.5 bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          </>
        )
      }
    >
      <div className="space-y-5">
        {/* Password */}
        <div>
          <p className="text-[10px] font-medium text-[#999] uppercase tracking-wider mb-1.5">Password</p>
          <div className="flex items-center gap-2 border border-[#eaeaea] rounded-lg px-3 py-2.5 bg-[#fafafa]">
            <span className="flex-1 font-mono text-sm text-[#0a0a0a] truncate select-all">
              {revealedPassword ?? "••••••••••••••••"}
            </span>
            <button
              onClick={handleTogglePassword}
              disabled={revealing}
              title={revealedPassword ? "Hide" : "Show"}
              className="p-1.5 rounded-md text-[#666] hover:bg-[#eee] hover:text-[#0a0a0a] transition-colors disabled:opacity-40"
            >
              {revealedPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => handleCopy("password")}
              disabled={revealing}
              title="Copy (auto-clears in 20s)"
              className="p-1.5 rounded-md text-[#666] hover:bg-[#eee] hover:text-[#0a0a0a] transition-colors disabled:opacity-40"
            >
              {copied === "password" ? <Check className="w-3.5 h-3.5 text-[#17c964]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          {entry.lastRevealedAt && (
            <p className="text-[10px] text-[#bbb] mt-1.5">
              Last viewed {formatDate(entry.lastRevealedAt)}{entry.lastRevealedBy ? ` by ${entry.lastRevealedBy}` : ""}
            </p>
          )}
        </div>

        {/* PIN */}
        {entry.hasPin && (
          <div>
            <p className="text-[10px] font-medium text-[#999] uppercase tracking-wider mb-1.5">PIN</p>
            <div className="flex items-center gap-2 border border-[#eaeaea] rounded-lg px-3 py-2.5 bg-[#fafafa]">
              <span className="flex-1 font-mono text-sm text-[#0a0a0a] truncate select-all">
                {revealedPin ?? "••••••"}
              </span>
              <button
                onClick={handleTogglePin}
                disabled={revealing}
                title={revealedPin ? "Hide" : "Show"}
                className="p-1.5 rounded-md text-[#666] hover:bg-[#eee] hover:text-[#0a0a0a] transition-colors disabled:opacity-40"
              >
                {revealedPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => handleCopy("pin")}
                disabled={revealing}
                title="Copy (auto-clears in 20s)"
                className="p-1.5 rounded-md text-[#666] hover:bg-[#eee] hover:text-[#0a0a0a] transition-colors disabled:opacity-40"
              >
                {copied === "pin" ? <Check className="w-3.5 h-3.5 text-[#17c964]" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-[10px] text-[#f31260]">{error}</p>}
        {(revealedPassword || revealedPin) && (
          <p className="text-[10px] text-[#999] -mt-3">Auto-hides in 20s · clipboard clears automatically</p>
        )}

        {/* Access */}
        <div className="flex items-center justify-between border border-[#eaeaea] rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            {entry.isOwner ? (
              <>
                <Users className="w-3.5 h-3.5 text-[#999] shrink-0" />
                <p className="text-xs text-[#666] truncate">
                  {entry.shareCount ? `Shared with ${entry.shareCount} ${entry.shareCount === 1 ? "person" : "people"}` : "Not shared with anyone"}
                </p>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-[#999] shrink-0" />
                <p className="text-xs text-[#666] truncate">
                  {entry.isAdminView ? `Owned by ${entry.ownerName || "another employee"}` : `Shared with you by ${entry.ownerName || "the owner"}`}
                </p>
              </>
            )}
          </div>
          {canManage && (
            <button
              onClick={() => onManageAccess(entry)}
              className="shrink-0 text-xs font-medium text-[#0070f3] hover:underline ml-3"
            >
              Manage
            </button>
          )}
        </div>

        {/* Details */}
        <div>
          <Row icon={Hash} label="ID" value={entry.accountId} />
          <Row icon={Mail} label="Email" value={entry.email} />
          <Row icon={ExternalLink} label="Website" value={entry.website} href={/^https?:\/\//.test(entry.website ?? "") ? entry.website : entry.website ? `https://${entry.website}` : undefined} />
          <RowList icon={Phone} label="Phone Numbers" values={entry.phoneNumbers} />
          <RowList icon={User} label="Points of Contact" values={entry.pointsOfContact} />
          {entry.customerId ? (
            <div className="flex items-start gap-3 py-2.5 border-b border-[#f5f5f5] last:border-0">
              <Building2 className="w-3.5 h-3.5 text-[#999] mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium text-[#999] uppercase tracking-wider">Linked Company</p>
                <Link href={`/customers/${entry.customerId}`} className="text-sm text-[#0070f3] hover:underline truncate block mt-0.5">
                  {entry.customerName || "View customer"}
                </Link>
              </div>
            </div>
          ) : (
            <Row icon={Building2} label="Linked Company" value={entry.customerName} />
          )}
        </div>

        {entry.tags.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-[#999] uppercase tracking-wider mb-1.5">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {entry.tags.map((tag) => (
                <span key={tag} className="text-[10px] font-medium text-[#666] bg-[#f5f5f5] px-2 py-1 rounded-full">{tag}</span>
              ))}
            </div>
          </div>
        )}

        {entry.notes && (
          <div>
            <p className="text-[10px] font-medium text-[#999] uppercase tracking-wider mb-1.5">Notes</p>
            <p className="text-sm text-[#444] whitespace-pre-wrap">{entry.notes}</p>
          </div>
        )}

        <div className="pt-2 border-t border-[#f5f5f5] flex items-center gap-1.5 text-[10px] text-[#bbb]">
          <Clock className="w-3 h-3" />
          Updated {formatDate(entry.updatedAt)} by {entry.updatedBy}
        </div>
      </div>
    </VaultModal>
  );
}
