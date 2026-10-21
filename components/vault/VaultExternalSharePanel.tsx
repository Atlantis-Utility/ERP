"use client";

import { useEffect, useState } from "react";
import { Send, Link2, Copy, Check, X, Clock, Eye, Mail, MailOpen, CheckCircle2, ChevronDown } from "lucide-react";
import DateTimePicker from "@/components/ui/DateTimePicker";
import Select from "@/components/ui/Select";
import { useConfirm } from "@/lib/confirm";
import { useToast } from "@/lib/toast";
import { listVaultExternalShares, createVaultExternalShare, revokeVaultExternalShare } from "@/lib/db/vault";
import { getAvatarColor, getInitials, formatDate } from "@/lib/utils";
import {
  VAULT_EXTERNAL_MAX_DAYS,
  type VaultEntryMeta, type VaultExternalShareInfo, type VaultExternalShareStatus, type VaultShareEventKind,
} from "@/lib/vault-types";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const EXPIRY_PRESETS: { id: string; label: string; ms: number }[] = [
  { id: "5m", label: "5 min", ms: 5 * MINUTE },
  { id: "10m", label: "10 min", ms: 10 * MINUTE },
  { id: "30m", label: "30 min", ms: 30 * MINUTE },
  { id: "1h", label: "1 hour", ms: HOUR },
  { id: "1d", label: "1 day", ms: 24 * HOUR },
  { id: "3d", label: "3 days", ms: 72 * HOUR },
  { id: "7d", label: "7 days", ms: 168 * HOUR },
  { id: "30d", label: "30 days", ms: 720 * HOUR },
];
// "In 45 minutes" for the quick handover on a call; a date and time for the
// contractor who starts on Monday. Both are a custom expiry.
type CustomMode = "duration" | "date";
const DURATION_UNITS = [
  { value: "minutes", label: "minutes", ms: MINUTE },
  { value: "hours", label: "hours", ms: HOUR },
  { value: "days", label: "days", ms: 24 * HOUR },
] as const;
type DurationUnit = (typeof DURATION_UNITS)[number]["value"];

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

// A link that dies later today needs the minute, not the date.
function formatWhen(d: Date, now: number): string {
  if (new Date(now).toDateString() === d.toDateString()) {
    return `today at ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function describeLifetime(ms: number): string {
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(ms / HOUR);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.round(ms / (24 * HOUR))} days`;
}

function relativeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  if (ms < MINUTE) return "in under a minute";
  const h = ms / HOUR;
  if (h < 1) return `in ${Math.round(ms / MINUTE)} min`;
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
  const [customMode, setCustomMode] = useState<CustomMode>("duration");
  const [durationAmount, setDurationAmount] = useState("45");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("minutes");
  const [maxViews, setMaxViews] = useState<number | null>(null);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [notifyOwner, setNotifyOwner] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // A clock for the summary line and validation, ticking so "expires in 1
  // hour" stays true while the form sits open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
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

  // An open shows up while you watch, without reopening the panel. Quiet:
  // no spinner, and a failed refresh keeps what's on screen.
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await listVaultExternalShares(entry.id);
        setShares(res.shares);
      } catch {}
    }, 30_000);
    return () => clearInterval(t);
  }, [entry.id]);

  // Presets and durations count from `at`: the summary line passes the
  // ticking clock, sending passes the moment of the click, so a "5 min" link
  // sent after a minute spent on the form still gives them five minutes.
  function resolveExpiry(at: number): Date | null {
    if (expiryPreset === "custom") {
      if (customMode === "date") return customExpiry ? new Date(customExpiry) : null;
      const amount = Number(durationAmount);
      const unit = DURATION_UNITS.find((u) => u.value === durationUnit)!;
      return Number.isFinite(amount) && amount > 0 ? new Date(at + amount * unit.ms) : null;
    }
    const preset = EXPIRY_PRESETS.find((p) => p.id === expiryPreset);
    return preset ? new Date(at + preset.ms) : null;
  }

  const expiresAt = resolveExpiry(now);
  const expiryProblem = (() => {
    if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
      return expiryPreset === "custom" && customMode === "duration"
        ? "Enter how long the link should last"
        : "Pick when the link should expire";
    }
    const ms = expiresAt.getTime() - now;
    if (ms < MINUTE) return "Pick a time at least a minute from now";
    if (ms > VAULT_EXTERNAL_MAX_DAYS * 24 * HOUR) return `A link can last at most ${VAULT_EXTERNAL_MAX_DAYS} days`;
    return null;
  })();

  const emailValid = EMAIL_RE.test(recipientEmail.trim());
  const canSend = emailValid && !expiryProblem && !sending && emailConfigured;

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setError("");
    try {
      const at = resolveExpiry(Date.now())!;
      const res = await createVaultExternalShare(entry.id, {
        recipientEmail: recipientEmail.trim(),
        recipientName: recipientName.trim() || undefined,
        message: message.trim() || undefined,
        expiresAt: at.toISOString(),
        maxViews,
        includeNotes,
        notifyOwner,
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
              <div className="mt-2.5 border border-[#eaeaea] rounded-xl p-3 bg-[#fafafa]">
                <div className="inline-flex gap-0.5 p-0.5 bg-[#f0f0f0] rounded-lg mb-2.5">
                  {([
                    { id: "duration", label: "After a set time" },
                    { id: "date", label: "On a date & time" },
                  ] as const).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setCustomMode(m.id)}
                      className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                        customMode === m.id ? "bg-white text-[#0a0a0a] shadow-sm" : "text-[#666] hover:text-[#0a0a0a]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {customMode === "duration" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#666] shrink-0">Expires in</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={durationAmount}
                      onChange={(e) => setDurationAmount(e.target.value)}
                      aria-label="How long"
                      className="w-20 border border-[#eaeaea] rounded-lg px-2.5 py-1.5 text-sm text-[#0a0a0a] bg-white focus:outline-none focus:border-[#0a0a0a] transition-colors"
                    />
                    <div className="w-32">
                      <Select
                        value={durationUnit}
                        onChange={(v) => setDurationUnit(v as DurationUnit)}
                        options={DURATION_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="max-w-xs">
                    <DateTimePicker value={customExpiry} onChange={setCustomExpiry} />
                  </div>
                )}
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

          <label className="flex items-start gap-2 text-xs text-[#444] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={notifyOwner}
              onChange={(e) => setNotifyOwner(e.target.checked)}
              className="accent-[#0a0a0a] mt-0.5"
            />
            <span>
              Email me when they open it
              <span className="block text-[10px] text-[#999] mt-0.5">
                Once, the first time they view the details. Every open is tracked below either way.
              </span>
            </span>
          </label>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className={`text-xs ${expiryProblem ? "text-[#f31260]" : "text-[#666]"}`}>
              {expiryProblem ?? (
                <>
                  Expires <span className="font-medium text-[#0a0a0a]">{formatWhen(expiresAt!, now)}</span>
                  <span className="text-[#999]"> ({describeLifetime(expiresAt!.getTime() - now)})</span>
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

const EVENT_LABEL: Record<VaultShareEventKind, { label: string; icon: React.ElementType }> = {
  email_opened: { label: "Email opened", icon: MailOpen },
  link_opened: { label: "Link opened", icon: Link2 },
  details_viewed: { label: "Details viewed", icon: Eye },
};
const STEPS: VaultShareEventKind[] = ["email_opened", "link_opened", "details_viewed"];

// "10:32 AM" today, "Oct 21, 10:32 AM" otherwise: the time is the point.
function stamp(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return new Date().toDateString() === d.toDateString()
    ? time
    : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}

function ShareRow({ share, onRevoke }: { share: VaultExternalShareInfo; onRevoke: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const who = share.recipientName || share.recipientEmail;
  const c = getAvatarColor(who);
  const status = STATUS[share.status];
  const when =
    share.status === "active" ? `Expires ${relativeUntil(share.expiresAt)}`
    : share.status === "revoked" && share.revokedAt ? `Revoked ${formatDate(share.revokedAt)}`
    : share.status === "expired" ? `Expired ${formatDate(share.expiresAt)}`
    : "All views used";

  // First time each step happened, and how often.
  const steps = STEPS.map((kind) => {
    const hits = share.events.filter((e) => e.kind === kind);
    return { kind, first: hits[0], last: hits[hits.length - 1], count: hits.length };
  });
  const opened = steps.some((s) => s.count > 0);

  return (
    <div className={`border border-[#eaeaea] rounded-lg ${share.status === "active" ? "" : "opacity-75"}`}>
      <div className="flex items-center gap-3 px-3 pt-2.5">
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
            <Send className="w-2.5 h-2.5 shrink-0" /> Sent {stamp(share.createdAt)}
            {share.createdByName && <span className="truncate">by {share.createdByName}</span>}
            <span className="shrink-0">·</span>
            <Clock className="w-2.5 h-2.5 shrink-0" /> {when}
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

      {/* Sent → email opened → link opened → details viewed, each with when. */}
      <div className="grid grid-cols-3 gap-1.5 px-3 pt-2.5 pb-2.5">
        {steps.map(({ kind, first, last, count }) => {
          const { label, icon: Icon } = EVENT_LABEL[kind];
          const done = count > 0;
          return (
            <div
              key={kind}
              title={done ? `First ${stamp(first!.at)}${count > 1 ? `, last ${stamp(last!.at)}` : ""}` : undefined}
              className={`rounded-md px-2 py-1.5 border ${done ? "border-[#bbf7d0] bg-[#f0fdf4]" : "border-[#f0f0f0] bg-[#fafafa]"}`}
            >
              <p className={`flex items-center gap-1 text-[10px] font-medium ${done ? "text-[#15803d]" : "text-[#999]"}`}>
                {done ? <Check className="w-3 h-3 shrink-0" /> : <Icon className="w-3 h-3 shrink-0" />}
                <span className="truncate">{label}</span>
                {count > 1 && <span className="shrink-0 text-[#15803d]/70">×{count}</span>}
              </p>
              <p className={`text-[11px] mt-0.5 truncate ${done ? "text-[#0a0a0a]" : "text-[#bbb]"}`}>
                {done ? stamp(kind === "details_viewed" ? last!.at : first!.at) : "Not yet"}
              </p>
            </div>
          );
        })}
      </div>

      {opened && (
        <div className="border-t border-[#f0f0f0]">
          <button
            onClick={() => setExpanded((x) => !x)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-[#666] hover:text-[#0a0a0a] transition-colors"
          >
            <span>Activity · {share.events.length} event{share.events.length === 1 ? "" : "s"}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          {expanded && (
            <ol className="px-3 pb-2.5 space-y-1.5">
              {[...share.events].reverse().map((e, i) => {
                const { label, icon: Icon } = EVENT_LABEL[e.kind];
                return (
                  <li key={i} className="flex items-center gap-2 text-[11px]">
                    <Icon className="w-3 h-3 text-[#999] shrink-0" />
                    <span className="text-[#0a0a0a] w-24 shrink-0">{label}</span>
                    <span className="text-[#666] shrink-0">
                      {new Date(e.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })}
                    </span>
                    {e.device && <span className="text-[#999] truncate">· {e.device}</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
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
