"use client";

import { use, useEffect, useState } from "react";
import {
  Eye, EyeOff, Copy, Check, ExternalLink, Lock, ShieldCheck, Clock, Hash, Mail, Globe, KeyRound,
  StickyNote, Ban, TimerOff, Link2Off,
} from "lucide-react";
import { copyWithAutoClear } from "@/lib/vault-client-utils";
import type { VaultSharedCredentials, VaultSharedLinkPreview, VaultExternalShareStatus } from "@/lib/vault-types";

type View =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "error" }
  | { kind: "closed"; status: Exclude<VaultExternalShareStatus, "active">; senderName: string }
  | { kind: "preview"; preview: Extract<VaultSharedLinkPreview, { status: "active" }> }
  | { kind: "revealed"; creds: VaultSharedCredentials; senderName: string };

/**
 * Where a credential shared outside the organisation is opened.
 *
 * Two steps on purpose. Loading the page only says what this is and who
 * sent it; the details come from an explicit click. Mail scanners open
 * links before people do, and if loading counted, a one-time link would be
 * spent before its recipient ever saw it.
 */
export default function SharedCredentialPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [view, setView] = useState<View>({ kind: "loading" });
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    fetch(`/api/shared/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404) return setView({ kind: "not_found" });
        const data = await res.json();
        if (res.status === 410) return setView({ kind: "closed", status: data.status, senderName: data.senderName });
        if (!res.ok) throw new Error();
        setView({ kind: "preview", preview: data });
      })
      .catch(() => setView({ kind: "error" }));
  }, [token]);

  async function reveal() {
    if (view.kind !== "preview") return;
    const senderName = view.preview.senderName;
    setRevealing(true);
    try {
      const res = await fetch(`/api/shared/${encodeURIComponent(token)}`, { method: "POST", cache: "no-store" });
      if (res.status === 404) return setView({ kind: "not_found" });
      const data = await res.json();
      if (res.status === 410) return setView({ kind: "closed", status: data.status, senderName: data.senderName });
      if (!res.ok) throw new Error();
      setView({ kind: "revealed", creds: data, senderName });
    } catch {
      setView({ kind: "error" });
    } finally {
      setRevealing(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center gap-2.5 justify-center mb-8">
        <div className="w-8 h-8 rounded-xl bg-[#0a0a0a] flex items-center justify-center shrink-0">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M8 2L14 13H2L8 2Z" fill="white" fillOpacity="0.9" />
          </svg>
        </div>
        <span className="text-[17px] font-semibold text-[#0a0a0a] tracking-tight">Atlantis Utility</span>
      </div>

      <div className="bg-white border border-[#eaeaea] rounded-2xl shadow-sm overflow-hidden">
        {view.kind === "loading" && (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {view.kind === "not_found" && (
          <Closed icon={Link2Off} title="This link isn't valid" body="Check that the whole address from the email was copied. If it still doesn't open, ask the person who sent it for a new link." />
        )}

        {view.kind === "error" && (
          <Closed icon={Ban} title="Something went wrong" body="We couldn't open this link just now. Please try again in a moment." tone="error" />
        )}

        {view.kind === "closed" && <ClosedFor status={view.status} senderName={view.senderName} />}

        {view.kind === "preview" && <Preview preview={view.preview} revealing={revealing} onReveal={reveal} />}

        {view.kind === "revealed" && (
          <Revealed creds={view.creds} senderName={view.senderName} />
        )}
      </div>

      <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#999] mt-5">
        <ShieldCheck className="w-3.5 h-3.5" />
        Shared securely through Atlantis Utility · encrypted in transit and at rest
      </div>
      <p className="text-center text-[11px] text-[#bbb] mt-1.5">Atlantis Utility &copy; {new Date().getFullYear()}</p>
    </div>
  );
}

// ── States ──────────────────────────────────────────────────────────────

function Preview({
  preview,
  revealing,
  onReveal,
}: {
  preview: Extract<VaultSharedLinkPreview, { status: "active" }>;
  revealing: boolean;
  onReveal: () => void;
}) {
  const expiry = useCountdown(preview.expiresAt);
  // A short link can run out while the page sits open; say so then rather
  // than offer a button the server will refuse.
  if (expiry.expired) return <ClosedFor status="expired" senderName={preview.senderName} />;

  return (
    <div className="p-8">
      <div className="w-11 h-11 rounded-xl bg-[#f5f5f5] flex items-center justify-center mb-5">
        <KeyRound className="w-5 h-5 text-[#0a0a0a]" />
      </div>
      <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Secure share</p>
      <h1 className="text-xl font-semibold text-[#0a0a0a] mt-1 break-words">{preview.entryName}</h1>
      <p className="text-sm text-[#666] mt-2">
        <span className="font-medium text-[#0a0a0a]">{preview.senderName}</span> shared these login details with{" "}
        <span className="font-medium text-[#0a0a0a] [overflow-wrap:anywhere]">{preview.recipientEmail}</span>.
      </p>

      {preview.message && (
        <div className="mt-5 border-l-[3px] border-[#0a0a0a] bg-[#fafafa] rounded-r-lg px-4 py-3">
          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-1">Message</p>
          <p className="text-sm text-[#444] whitespace-pre-wrap break-words">{preview.message}</p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Fact icon={Clock} label="Expires" value={expiry.relative} detail={expiry.absolute} />
        <Fact
          icon={Eye}
          label="Views left"
          value={preview.viewsLeft === null ? "Unlimited" : String(preview.viewsLeft)}
          detail={preview.viewsLeft === null ? "until it expires" : preview.viewsLeft === 1 ? "this is the last one" : "including this one"}
        />
      </div>

      <button
        onClick={onReveal}
        disabled={revealing}
        className="w-full mt-6 flex items-center justify-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium py-3 rounded-xl hover:bg-[#333] transition-colors disabled:opacity-50"
      >
        <Lock className="w-4 h-4" />
        {revealing ? "Opening…" : "View login details"}
      </button>
      {preview.viewsLeft !== null && (
        <p className="text-[11px] text-[#999] text-center mt-2.5">
          {preview.viewsLeft === 1
            ? "This link can be opened once. Copy what you need before you leave the page."
            : "Opening the details uses one view."}
        </p>
      )}
    </div>
  );
}

function Revealed({ creds, senderName }: { creds: VaultSharedCredentials; senderName: string }) {
  const expiry = useCountdown(creds.expiresAt);
  // Hiding keeps the details in memory rather than fetching them again:
  // a second fetch would spend another view on a limited link.
  const [hidden, setHidden] = useState(false);
  const websiteHref = creds.website ? (/^https?:\/\//i.test(creds.website) ? creds.website : `https://${creds.website}`) : undefined;

  // The link's time is up: the details come off the screen too, not just
  // out of reach of the next visit. Otherwise "expires in 5 minutes" would
  // mean "readable for as long as this tab stays open".
  if (expiry.expired) return <ClosedFor status="expired" senderName={senderName} />;

  return (
    <>
      <div className="px-8 pt-8 pb-5 border-b border-[#f0f0f0]">
        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Login details</p>
        <h1 className="text-xl font-semibold text-[#0a0a0a] mt-1 break-words">{creds.entryName}</h1>
        <p className="text-xs text-[#999] mt-1.5">Shared by {senderName}</p>
      </div>

      {hidden ? (
        <div className="px-8 py-10 text-center">
          <EyeOff className="w-5 h-5 text-[#999] mx-auto" />
          <p className="text-sm text-[#666] mt-2">Details hidden. Show them again whenever you need them.</p>
        </div>
      ) : (
      <div className="px-8 py-5 space-y-3">
        {creds.website && (
          <Field icon={Globe} label="Website" value={creds.website} href={websiteHref} />
        )}
        {creds.accountId && <Field icon={Hash} label="Username / ID" value={creds.accountId} mono />}
        {creds.email && <Field icon={Mail} label="Email" value={creds.email} />}
        <Field icon={KeyRound} label="Password" value={creds.password} secret mono />
        {creds.pin && <Field icon={Lock} label="PIN" value={creds.pin} secret mono />}
        {creds.notes && (
          <div className="border border-[#eaeaea] rounded-xl px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <StickyNote className="w-3.5 h-3.5 text-[#999]" />
              <p className="text-[10px] font-medium text-[#999] uppercase tracking-wider">Notes</p>
            </div>
            <p className="text-sm text-[#444] whitespace-pre-wrap break-words">{creds.notes}</p>
          </div>
        )}
      </div>
      )}

      <div className="px-8 py-4 bg-[#fafafa] border-t border-[#f0f0f0] flex items-center justify-between gap-3">
        <p className="text-[11px] text-[#666] min-w-0">
          {creds.viewsLeft === 0
            ? "That was the last view. This link no longer opens."
            : `Link expires ${expiry.relative === "now" ? "now" : `in ${expiry.relative}`}${
                creds.viewsLeft !== null ? ` · ${creds.viewsLeft} view${creds.viewsLeft === 1 ? "" : "s"} left` : ""
              }`}
        </p>
        <button
          onClick={() => setHidden((h) => !h)}
          className="shrink-0 flex items-center gap-1.5 border border-[#eaeaea] bg-white text-xs font-medium text-[#444] px-3 py-1.5 rounded-lg hover:bg-[#f5f5f5] transition-colors"
        >
          {hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {hidden ? "Show" : "Hide"}
        </button>
      </div>
    </>
  );
}

function ClosedFor({ status, senderName }: { status: Exclude<VaultExternalShareStatus, "active">; senderName: string }) {
  const ask = `Ask ${senderName} to send you a new link if you still need these details.`;
  if (status === "expired") return <Closed icon={TimerOff} title="This link has expired" body={ask} />;
  if (status === "used_up") return <Closed icon={Eye} title="This link has already been used" body={`It could only be opened a set number of times, and those views are used up. ${ask}`} />;
  return <Closed icon={Ban} title="This link was turned off" body={`${senderName} has stopped sharing these details through this link.`} />;
}

function Closed({ icon: Icon, title, body, tone }: { icon: React.ElementType; title: string; body: string; tone?: "error" }) {
  return (
    <div className="p-8 text-center">
      <div className={`w-11 h-11 rounded-xl mx-auto mb-5 flex items-center justify-center ${tone === "error" ? "bg-[#fef2f2]" : "bg-[#f5f5f5]"}`}>
        <Icon className={`w-5 h-5 ${tone === "error" ? "text-[#dc2626]" : "text-[#666]"}`} />
      </div>
      <h1 className="text-lg font-semibold text-[#0a0a0a]">{title}</h1>
      <p className="text-sm text-[#666] mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────

function Fact({ icon: Icon, label, value, detail }: { icon: React.ElementType; label: string; value: string; detail: string }) {
  return (
    <div className="border border-[#eaeaea] rounded-xl px-3.5 py-3 min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-[#999]" />
        <p className="text-[10px] font-medium text-[#999] uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-sm font-medium text-[#0a0a0a] mt-1 truncate">{value}</p>
      <p className="text-[11px] text-[#999] truncate" title={detail}>{detail}</p>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  href,
  secret,
  mono,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  href?: string;
  secret?: boolean;
  mono?: boolean;
}) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);

  async function copy() {
    // Secrets clear themselves from the clipboard, as they do in the vault.
    if (secret) await copyWithAutoClear(value);
    else await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="border border-[#eaeaea] rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-[#999]" />
        <p className="text-[10px] font-medium text-[#999] uppercase tracking-wider">{label}</p>
      </div>
      <div className="flex items-center gap-2 mt-1">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-w-0 text-sm text-[#0070f3] hover:underline truncate flex items-center gap-1"
          >
            <span className="truncate">{value}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        ) : (
          <span className={`flex-1 min-w-0 text-sm text-[#0a0a0a] break-all select-all ${mono ? "font-mono" : ""}`}>
            {shown ? value : "•".repeat(Math.min(Math.max(value.length, 8), 16))}
          </span>
        )}
        {secret && (
          <button
            onClick={() => setShown((s) => !s)}
            title={shown ? "Hide" : "Show"}
            aria-label={shown ? `Hide ${label}` : `Show ${label}`}
            className="shrink-0 p-1.5 rounded-md text-[#666] hover:bg-[#f5f5f5] hover:text-[#0a0a0a] transition-colors"
          >
            {shown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
        <button
          onClick={copy}
          title={secret ? "Copy (clipboard clears in 20s)" : "Copy"}
          aria-label={`Copy ${label}`}
          className="shrink-0 p-1.5 rounded-md text-[#666] hover:bg-[#f5f5f5] hover:text-[#0a0a0a] transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-[#17c964]" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

/**
 * "23 hours" / "4 days", and the exact moment in the viewer's own zone.
 * Inside the last ten minutes it counts seconds, because a 5-minute link
 * is a handover in progress and "4 min" for a whole minute is no use.
 */
function useCountdown(iso: string): { relative: string; absolute: string; expired: boolean } {
  const target = new Date(iso).getTime();
  const [now, setNow] = useState(() => Date.now());
  const close = target - now < 10 * 60_000;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), close ? 1_000 : 15_000);
    return () => clearInterval(t);
  }, [close]);

  const ms = target - now;
  const minutes = Math.round(ms / 60_000);
  const relative =
    ms <= 0 ? "now"
    : ms < 10 * 60_000 ? `${Math.floor(ms / 60_000)} min ${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")} sec`
    : minutes < 60 ? `${minutes} min`
    : minutes < 48 * 60 ? `${Math.round(minutes / 60)} hour${Math.round(minutes / 60) === 1 ? "" : "s"}`
    : `${Math.round(minutes / 1440)} days`;
  const absolute = new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));
  return { relative, absolute, expired: ms <= 0 };
}
