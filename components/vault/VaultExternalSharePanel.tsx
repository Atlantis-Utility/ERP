"use client";

import { useEffect, useMemo, useState } from "react";
import { Send, Link2, Copy, Check, X, Clock, Eye, Mail, CheckCircle2 } from "lucide-react";
import DateTimePicker from "@/components/ui/DateTimePicker";
import { useConfirm } from "@/lib/confirm";
import { useToast } from "@/lib/toast";
import { listVaultExternalShares, createVaultExternalShare, revokeVaultExternalShare } from "@/lib/db/vault";
import { getAvatarColor, getInitials, formatDate } from "@/lib/utils";
import { VAULT_EXTERNAL_MAX_DAYS, type VaultEntryMeta, type VaultExternalShareInfo, type VaultExternalShareStatus } from "@/lib/vault-types";

const HOUR = 3_600_000;
const EXPIRY_PRESETS: { id: string; label: string; ms: number }[] = [
  { id: "1h", label: "1 hour", ms: HOUR },
  { id: "1d", label: "1 day", ms: 24 * HOUR },
  { id: "3d", label: "3 days", ms: 72 * HOUR },
  { id: "7d", label: "7 days", ms: 168 * HOUR },
  { id: "30d", label: "30 days", ms: 720 * HOUR },
];
const VIEW_PRESETS: { label: string; value: number | null }[] = [
  { label: "Unlimited", value: null },
  { label: "Once", value: 1 },
  { label: "3 times", value: 3 },
  { label: "10 times", value: 10 },
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS: Record<VaultExternalShareStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-[#f0fdf4] text-[#15803d]" },
  expired: { label: "Expired", className: "bg-[#f5f5f5] text-[#666]" },
  used_up: { label: "Used", className: "bg-[#f5f5f5] text-[#666]" },
  revoked: { label: "Revoked", className: "bg-[#fef2f2] text-[#b91c1c]" },
};

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(d: Date): string {
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function relativeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = ms / HOUR;
  if (h < 1) return `in ${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 48) return `in ${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"}`;
  return `in ${Math.round(h / 24)} days`;
}

/**
 * Sharing a credential with someone who isn't on the Employees page: a
 * vendor, a contractor, a customer's IT person. They get an email with a
 * link that stops working when the owner says, and open it on a page in the
 * app's own look. See supabase/migration-vault-external-shares.sql.
 */
export default function VaultExternalSharePanel({ entry }: { entry: VaultEntryMeta }) {
  const confirm = useConfirm();
  const toast = useToast();

  const [shares, setShares] = useState<VaultExternalShareInfo[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [message, setMessage] = useState("");
  const [expiryPreset, setExpiryPreset] = useState("1d");
  const [customExpiry, setCustomExpiry] = useState(() => toLocalInput(new Date(Date.now() + 48 * HOUR)));
  const [maxViews, setMaxViews] = useState<number | null>(null);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // A clock for the summary line and validation, ticking so "expires in 1
  // hour" stays true while the form sits open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await listVaultExternalShares(entry.id);
      setShares(res.shares);
      setEmailConfigured(res.emailConfigured);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load outside links");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id]);

  const expiresAt = useMemo(() => {
    if (expiryPreset === "custom") return customExpiry ? new Date(customExpiry) : null;
    const preset = EXPIRY_PRESETS.find((p) => p.id === expiryPreset);
    return preset ? new Date(now + preset.ms) : null;
    // Recomputed on send as well; this one is for the summary line.
  }, [expiryPreset, customExpiry, now]);

  const expiryProblem = useMemo(() => {
    if (!expiresAt || Number.isNaN(expiresAt.getTime())) return "Pick when the link should expire";
    const ms = expiresAt.getTime() - now;
    if (ms < 5 * 60_000) return "Pick a time at least a few minutes from now";
    if (ms > VAULT_EXTERNAL_MAX_DAYS * 24 * HOUR) return `A link can last at most ${VAULT_EXTERNAL_MAX_DAYS} days`;
    return null;
  }, [expiresAt, now]);

  const emailValid = EMAIL_RE.test(recipientEmail.trim());
  const canSend = emailValid && !expiryProblem && !sending && emailConfigured;

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setError("");
    try {
      const preset = EXPIRY_PRESETS.find((p) => p.id === expiryPreset);
      const at = preset ? new Date(Date.now() + preset.ms) : new Date(customExpiry);
      const res = await createVaultExternalShare(entry.id, {
        recipientEmail: recipientEmail.trim(),
        recipientName: recipientName.trim() || undefined,
        message: message.trim() || undefined,
        expiresAt: at.toISOString(),
        maxViews,
        includeNotes,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setShares((prev) => [res.share, ...prev]);
      setSent({ email: res.share.recipientEmail, url: res.url });
      toast.success(`Secure link sent to ${res.share.recipientEmail}`);
      setRecipientEmail("");
      setRecipientName("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send link");
    } finally {
      setSending(false);
    }
  }

  async function handleRevoke(share: VaultExternalShareInfo) {
    const ok = await confirm({
      title: "Revoke this link?",
      description: `${share.recipientEmail} won't be able to open it any more. This can't be undone; you can always send a new link.`,
      confirmLabel: "Revoke",
    });
    if (!ok) return;
    try {
      await revokeVaultExternalShare(entry.id, share.id);
      setShares((prev) => prev.map((s) => (s.id === share.id ? { ...s, status: "revoked", revokedAt: new Date().toISOString() } : s)));
      toast.success("Link revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke link");
    }
  }

  async function copyLink() {
    if (!sent) return;
    await navigator.clipboard.writeText(sent.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const active = shares.filter((s) => s.status === "active");
  const past = shares.filter((s) => s.status !== "active");

  return (
    <div className="space-y-6">
      {error && (
        <div className="border border-[#fecdd3] bg-[#fef2f2] text-[#b91c1c] text-xs rounded-lg px-3 py-2.5">{error}</div>
      )}
      {!emailConfigured && (
        <div className="border border-[#eaeaea] bg-[#fafafa] text-[#666] text-xs rounded-lg px-3 py-2.5">
          Email isn&rsquo;t set up on this server, so outside links can&rsquo;t be sent yet.
        </div>
      )}

      {sent ? (
        <div className="border border-[#bbf7d0] bg-[#f0fdf4] rounded-xl p-4">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#17c964] mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#0a0a0a]">Secure link sent to {sent.email}</p>
              <p className="text-xs text-[#666] mt-0.5">
                If it doesn&rsquo;t arrive, copy the link and send it another way. This is the only time it can be copied.
              </p>
              <div className="flex items-center gap-2 mt-3 bg-white border border-[#eaeaea] rounded-lg pl-3 pr-1.5 py-1.5">
                <Link2 className="w-3.5 h-3.5 text-[#999] shrink-0" />
                <span className="flex-1 min-w-0 truncate font-mono text-xs text-[#444]">{sent.url}</span>
                <button
                  onClick={copyLink}
                  className="shrink-0 flex items-center gap-1 text-xs font-medium text-[#0a0a0a] px-2 py-1 rounded-md hover:bg-[#f5f5f5] transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[#17c964]" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <button onClick={() => setSent(null)} className="text-xs font-medium text-[#0070f3] hover:underline mt-3">
                Share with someone else
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Email address</Label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-[#999] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full border border-[#eaeaea] rounded-lg pl-8 pr-3 py-2 text-sm text-[#0a0a0a] bg-white placeholder:text-[#bbb] focus:outline-none focus:border-[#0a0a0a] transition-colors"
                />
              </div>
            </div>
            <div>
              <Label optional>Their name</Label>
              <input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] bg-white placeholder:text-[#bbb] focus:outline-none focus:border-[#0a0a0a] transition-colors"
              />
            </div>
          </div>

          <div>
            <Label>Link expires after</Label>
            <div className="flex flex-wrap gap-1.5">
              {EXPIRY_PRESETS.map((p) => (
                <Chip key={p.id} active={expiryPreset === p.id} onClick={() => setExpiryPreset(p.id)}>{p.label}</Chip>
              ))}
              <Chip active={expiryPreset === "custom"} onClick={() => setExpiryPreset("custom")}>Custom…</Chip>
            </div>
            {expiryPreset === "custom" && (
              <div className="mt-2 max-w-xs">
                <DateTimePicker value={customExpiry} onChange={setCustomExpiry} />
              </div>
            )}
          </div>

          <div>
            <Label>Can be opened</Label>
            <div className="flex flex-wrap gap-1.5">
              {VIEW_PRESETS.map((p) => (
                <Chip key={p.label} active={maxViews === p.value} onClick={() => setMaxViews(p.value)}>{p.label}</Chip>
              ))}
            </div>
          </div>

          <div>
            <Label optional>Message</Label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Here are the details for the router at the Main St site."
              className="w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] bg-white placeholder:text-[#bbb] focus:outline-none focus:border-[#0a0a0a] transition-colors resize-none"
            />
          </div>

          <div className="border border-[#eaeaea] rounded-xl p-3.5 bg-[#fafafa]">
            <p className="text-[10px] font-medium text-[#999] uppercase tracking-wider mb-2">They&rsquo;ll see</p>
            <div className="flex flex-wrap gap-1.5">
              {entry.website && <Included>Website</Included>}
              {entry.accountId && <Included>Username / ID</Included>}
              {entry.email && <Included>Email</Included>}
              <Included>Password</Included>
              {entry.hasPin && <Included>PIN</Included>}
              {includeNotes && entry.notes && <Included>Notes</Included>}
            </div>
            {entry.notes && (
              <label className="flex items-center gap-2 mt-3 text-xs text-[#666] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeNotes}
                  onChange={(e) => setIncludeNotes(e.target.checked)}
                  className="accent-[#0a0a0a]"
                />
                Include the notes on this entry
              </label>
            )}
            <p className="text-[10px] text-[#999] mt-2.5">Phone numbers, contacts and tags stay internal.</p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className={`text-xs ${expiryProblem ? "text-[#f31260]" : "text-[#666]"}`}>
              {expiryProblem ?? (
                <>
                  Expires <span className="font-medium text-[#0a0a0a]">{formatWhen(expiresAt!)}</span>
                  {maxViews !== null && <> · opens {maxViews === 1 ? "once" : `${maxViews} times`}</>}
                </>
              )}
            </p>
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="shrink-0 flex items-center justify-center gap-1.5 bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              {sending ? "Sending…" : "Send secure link"}
            </button>
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] font-medium text-[#999] uppercase tracking-wider mb-1.5">
          Outside links {active.length > 0 && `· ${active.length} active`}
        </p>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-4 h-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : shares.length === 0 ? (
          <p className="text-xs text-[#bbb]">No links sent outside the organization yet.</p>
        ) : (
          <div className="space-y-1.5">
            {[...active, ...past].map((s) => (
              <ShareRow key={s.id} share={s} onRevoke={() => handleRevoke(s)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ShareRow({ share, onRevoke }: { share: VaultExternalShareInfo; onRevoke: () => void }) {
  const who = share.recipientName || share.recipientEmail;
  const c = getAvatarColor(who);
  const status = STATUS[share.status];
  const views = share.maxViews === null ? `${share.viewCount} view${share.viewCount === 1 ? "" : "s"}` : `${share.viewCount} of ${share.maxViews} views`;
  const when =
    share.status === "active" ? `Expires ${relativeUntil(share.expiresAt)}`
    : share.status === "revoked" && share.revokedAt ? `Revoked ${formatDate(share.revokedAt)}`
    : share.status === "expired" ? `Expired ${formatDate(share.expiresAt)}`
    : "All views used";

  return (
    <div className={`flex items-center gap-3 border border-[#eaeaea] rounded-lg px-3 py-2.5 ${share.status === "active" ? "" : "opacity-70"}`}>
      <div className={`w-7 h-7 rounded-full ${c.bg} ${c.text} flex items-center justify-center shrink-0`}>
        <span className="text-[10px] font-semibold">{getInitials(who)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm text-[#0a0a0a] truncate">{who}</p>
          <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
        </div>
        <p className="text-[10px] text-[#999] truncate flex items-center gap-1">
          {share.recipientName && <span className="truncate">{share.recipientEmail} ·</span>}
          <Clock className="w-2.5 h-2.5 shrink-0" /> {when}
          <span className="shrink-0">·</span>
          <Eye className="w-2.5 h-2.5 shrink-0" /> {views}
          {share.createdByName && <span className="truncate">· sent by {share.createdByName} {formatDate(share.createdAt)}</span>}
        </p>
      </div>
      {share.status === "active" && (
        <button
          onClick={onRevoke}
          title="Revoke link"
          className="shrink-0 p-1.5 rounded-md text-[#999] hover:bg-[#fef2f2] hover:text-[#dc2626] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function Label({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <p className="text-[10px] font-medium text-[#999] uppercase tracking-wider mb-1.5">
      {children}
      {optional && <span className="normal-case tracking-normal text-[#bbb]"> (optional)</span>}
    </p>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
        active ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "bg-white text-[#444] border-[#eaeaea] hover:border-[#d4d4d4]"
      }`}
    >
      {children}
    </button>
  );
}

function Included({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-[11px] font-medium text-[#444] bg-white border border-[#eaeaea] px-2 py-1 rounded-md">
      <Check className="w-3 h-3 text-[#17c964]" />
      {children}
    </span>
  );
}
