"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Search, Send, Users, X, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/confirm";
import { useAuth } from "@/lib/auth-context";
import { customerStatusKey, type CustomerStatusKey } from "@/lib/customer-status";
import { listCustomerProfiles, type CustomerProfileOverlay } from "@/lib/db/customer-profiles";
import { listUnifiLinks } from "@/lib/db/unifi-links";
import { findBilledIsp } from "@/lib/isp-accounts";
import { canonicalIsp } from "@/lib/isp-match";
import { buildBroadcastEmail, type BroadcastContent } from "@/lib/email/broadcast-email";
import { BROADCAST_TEMPLATES, unfilledPlaceholders } from "@/lib/email/broadcast-templates";
import { getErrorMessage } from "@/lib/utils";

/**
 * Telling customers something, in bulk.
 *
 * Two halves: who it goes to, and what it says. The first is the one that
 * matters - "everyone" is almost never the right answer to an outage, and a
 * notice sent to customers who aren't affected is worse than no notice,
 * because the next one gets ignored. So the audience is built from what we
 * actually know about each customer: what they buy from us, who their
 * circuit is with, and whether they're still a customer at all.
 *
 * Nothing here can send by itself. The count is in front of you the whole
 * time, the preview is the real email rather than an impression of it, and
 * the send asks once more with the number in the question.
 */

interface PortalCustomer {
  id: string;
  company: string;
  contact: string;
  email: string;
  status: string;
}

type ServiceKey = "internet" | "backup" | "network";

const SERVICES: { key: ServiceKey; label: string; hint: string }[] = [
  { key: "internet", label: "Internet", hint: "Has a primary circuit on file" },
  { key: "backup", label: "Backup circuit", hint: "Has a second, failover circuit" },
  { key: "network", label: "Managed network", hint: "UniFi site linked to us" },
];

const STATUSES: { key: CustomerStatusKey; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "suspended", label: "Suspended" },
  { key: "terminated", label: "Terminated" },
];

interface Enriched extends PortalCustomer {
  statusKey: CustomerStatusKey;
  services: Set<ServiceKey>;
  providers: string[];
  /** Everyone we could write to there: the account address plus contacts. */
  addresses: { email: string; name: string }[];
}

const clean = (s: string) => s.trim();

/** A template is a constant; editing the form must not edit the template. */
const copyContent = (c: BroadcastContent): BroadcastContent => ({
  ...c,
  details: c.details.map((d) => ({ ...d })),
  cta: c.cta ? { ...c.cta } : null,
});

export default function CustomerEmailTab() {
  const { authUser } = useAuth();
  const { success, error: toastError } = useToast();
  const confirm = useConfirm();

  const [customers, setCustomers] = useState<PortalCustomer[]>([]);
  const [profiles, setProfiles] = useState<CustomerProfileOverlay[]>([]);
  const [unifiIds, setUnifiIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Audience
  const [statuses, setStatuses] = useState<CustomerStatusKey[]>(["open"]);
  const [services, setServices] = useState<ServiceKey[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [allContacts, setAllContacts] = useState(false);
  const [search, setSearch] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [showList, setShowList] = useState(false);

  // Message. Seeded straight from the first template rather than filled in
  // by an effect: an effect that writes state on mount is a cascading
  // render the compiler rightly complains about, and the form has a sane
  // first state anyway.
  const [templateId, setTemplateId] = useState(BROADCAST_TEMPLATES[0].id);
  const [subject, setSubject] = useState(BROADCAST_TEMPLATES[0].subject);
  const [content, setContent] = useState<BroadcastContent>(() => copyContent(BROADCAST_TEMPLATES[0].content));
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [res, profileRows, links] = await Promise.all([
          fetch("/api/ringlogix/customers"),
          listCustomerProfiles().catch(() => [] as CustomerProfileOverlay[]),
          listUnifiLinks().catch(() => []),
        ]);
        const data = await res.json();
        const list: PortalCustomer[] = Array.isArray(data) ? data : (data.data ?? []);
        if (!alive) return;
        setCustomers(list);
        setProfiles(profileRows);
        setUnifiIds(new Set(links.map((l) => l.customerId)));
      } catch (err) {
        if (alive) setLoadError(getErrorMessage(err, "Couldn't load the customer list"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Apply a template: everything it carries, so switching back and forth
  // doesn't leave half of the last one behind.
  function applyTemplate(id: string) {
    const t = BROADCAST_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setTemplateId(id);
    setSubject(t.subject);
    setContent(copyContent(t.content));
  }

  const enriched: Enriched[] = useMemo(() => {
    const byId = new Map(profiles.map((p) => [p.customerId, p]));
    return customers.map((c) => {
      const p = byId.get(c.id);
      const billed = findBilledIsp(c.company);
      const services = new Set<ServiceKey>();
      if (clean(p?.isp ?? "") || billed?.primary) services.add("internet");
      if (clean(p?.backupIsp ?? "") || billed?.backup) services.add("backup");
      if (unifiIds.has(c.id)) services.add("network");

      // One chip per carrier, not one per spelling: "T-Mobile" and
      // "T-Mobile USA" are the same outage (lib/isp-match.ts). Deduped
      // because a customer on the same carrier twice is still one customer.
      const providerNames = [
        ...new Set(
          [p?.isp, p?.backupIsp].map((x) => canonicalIsp(x ?? "")).filter(Boolean),
        ),
      ];

      const addresses: { email: string; name: string }[] = [];
      if (c.email) addresses.push({ email: c.email, name: c.company });
      for (const contact of p?.contacts ?? []) {
        if (contact.email?.trim()) addresses.push({ email: contact.email.trim(), name: c.company });
      }

      return {
        ...c,
        statusKey: customerStatusKey(c.status),
        services,
        providers: providerNames,
        addresses,
      };
    });
  }, [customers, profiles, unifiIds]);

  const providerOptions = useMemo(() => {
    const names = new Map<string, number>();
    for (const c of enriched) {
      for (const p of c.providers) names.set(p, (names.get(p) ?? 0) + 1);
    }
    return [...names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [enriched]);

  const matched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((c) => {
      if (!statuses.includes(c.statusKey)) return false;
      // Services are "any of", not "all of": an outage notice goes to
      // everyone on a circuit, not only to those on two.
      if (services.length > 0 && !services.some((s) => c.services.has(s))) return false;
      if (providers.length > 0 && !c.providers.some((p) => providers.includes(p))) return false;
      if (q && !(c.company.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))) return false;
      return c.addresses.length > 0;
    });
  }, [enriched, statuses, services, providers, search]);

  const included = useMemo(() => matched.filter((c) => !excluded.has(c.id)), [matched, excluded]);

  const recipients = useMemo(() => {
    const seen = new Set<string>();
    const out: { email: string; name: string }[] = [];
    for (const c of included) {
      const take = allContacts ? c.addresses : c.addresses.slice(0, 1);
      for (const a of take) {
        const key = a.email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(a);
      }
    }
    return out;
  }, [included, allContacts]);

  const preview = useMemo(
    () => buildBroadcastEmail(content, { customerName: included[0]?.company ?? "Pizza Man Dan" }).html,
    [content, included],
  );

  const placeholders = useMemo(() => unfilledPlaceholders(content, subject), [content, subject]);
  const noMessage = !content.body.trim() || !subject.trim();

  function toggle<T>(list: T[], value: T, set: (v: T[]) => void) {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  function setDetail(index: number, patch: Partial<{ label: string; value: string }>) {
    setContent((prev) => ({
      ...prev,
      details: prev.details.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    }));
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, content, test: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't send the test");
      success(`Test sent to ${data.to}.`);
    } catch (err) {
      toastError(getErrorMessage(err, "Couldn't send the test"));
    } finally {
      setTesting(false);
    }
  }

  async function send() {
    const names = included.slice(0, 3).map((c) => c.company).join(", ");
    const ok = await confirm({
      title: `Email ${recipients.length} ${recipients.length === 1 ? "address" : "addresses"}?`,
      description:
        `This sends "${subject}" to ${included.length} customer${included.length === 1 ? "" : "s"}` +
        `${names ? ` — ${names}${included.length > 3 ? ` and ${included.length - 3} more` : ""}` : ""}.` +
        (placeholders.length
          ? `\n\nStill unfilled: ${placeholders.join(", ")}. Those will go out exactly as written.`
          : "") +
        "\n\nIt can't be unsent.",
      confirmLabel: "Send it",
      variant: placeholders.length ? "danger" : "warning",
    });
    if (!ok) return;

    setSending(true);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, content, recipients }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The send failed");
      const failed = (data.failures ?? []).length;
      const rejected = (data.rejected ?? []).length;
      success(
        `Sent to ${data.sent} ${data.sent === 1 ? "address" : "addresses"}.` +
          (failed ? ` ${failed} failed.` : "") +
          (rejected ? ` ${rejected} weren't on file and were skipped.` : ""),
      );
    } catch (err) {
      toastError(getErrorMessage(err, "The send failed"));
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
        <p className="text-sm text-[#666]">Loading customers…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-12 text-center">
        <AlertTriangle className="w-6 h-6 text-[#f31260] mx-auto mb-3" />
        <p className="text-sm font-medium text-[#0a0a0a] mb-1">Couldn&apos;t load the customer list</p>
        <p className="text-xs text-[#999]">{loadError}</p>
      </div>
    );
  }

  const chip = (on: boolean) =>
    `text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
      on ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "bg-white text-[#666] border-[#eaeaea] hover:border-[#ccc]"
    }`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* ── Who it goes to ─────────────────────────────────────────── */}
      <div className="space-y-6">
        <section className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-[#0070f3]" />
            <p className="text-sm font-semibold text-[#0a0a0a]">Who it goes to</p>
            <span className="ml-auto text-xs text-[#999]">
              {recipients.length} {recipients.length === 1 ? "address" : "addresses"} · {included.length} customers
            </span>
          </div>

          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-2">Account status</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {STATUSES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => toggle(statuses, s.key, setStatuses)}
                data-tip={s.key === "terminated" ? "They've left. Rarely who you want." : undefined}
                className={chip(statuses.includes(s.key))}
              >
                {s.label}
              </button>
            ))}
          </div>

          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-2">
            Service <span className="text-[#ccc] normal-case tracking-normal">· any of these, blank means everyone</span>
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {SERVICES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => toggle(services, s.key, setServices)}
                data-tip={s.hint}
                className={chip(services.includes(s.key))}
              >
                {s.label}
              </button>
            ))}
          </div>

          {providerOptions.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-2">
                Provider <span className="text-[#ccc] normal-case tracking-normal">· when one carrier is down</span>
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {providerOptions.map(([name, count]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggle(providers, name, setProviders)}
                    className={chip(providers.includes(name))}
                  >
                    {name} <span className="opacity-60">{count}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="flex items-start gap-2.5 px-3 py-2 rounded-lg border border-[#eaeaea] cursor-pointer hover:bg-[#fafafa] transition-colors">
            <input
              type="checkbox"
              checked={allContacts}
              onChange={() => setAllContacts((v) => !v)}
              className="mt-0.5 w-3.5 h-3.5 accent-[#0a0a0a] cursor-pointer"
            />
            <span>
              <span className="block text-[13px] font-medium text-[#0a0a0a]">Every contact on file</span>
              <span className="block text-[11px] text-[#999]">
                Not just the account address. More people hear, more inboxes.
              </span>
            </span>
          </label>

          <div className="flex items-center gap-2 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#999]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Narrow by name or email…"
                className="w-full border border-[#eaeaea] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#0070f3]"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowList((v) => !v)}
              className="text-xs font-medium text-[#0070f3] hover:underline whitespace-nowrap"
            >
              {showList ? "Hide list" : "Check the list"}
            </button>
          </div>

          {showList && (
            <div className="mt-3 border border-[#eaeaea] rounded-lg max-h-72 overflow-y-auto divide-y divide-[#f4f4f4]">
              {matched.length === 0 && (
                <p className="text-xs text-[#999] p-4 text-center">Nobody matches those filters.</p>
              )}
              {matched.map((c) => {
                const out = excluded.has(c.id);
                return (
                  <div key={c.id} className={`flex items-center gap-2 px-3 py-2 ${out ? "opacity-40" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[#0a0a0a] truncate">{c.company}</p>
                      <p className="text-[11px] text-[#999] truncate">
                        {(allContacts ? c.addresses : c.addresses.slice(0, 1)).map((a) => a.email).join(", ")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setExcluded((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        })
                      }
                      data-tip={out ? "Put back" : "Leave this one out"}
                      className="shrink-0 p-1 rounded-md text-[#999] hover:bg-[#f5f5f5] hover:text-[#0a0a0a] transition-colors"
                    >
                      {out ? <Plus className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── What it says ─────────────────────────────────────────── */}
        <section className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-4 h-4 text-[#0070f3]" />
            <p className="text-sm font-semibold text-[#0a0a0a]">What it says</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
            {BROADCAST_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                data-tip={t.description}
                className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                  templateId === t.id
                    ? "border-[#0a0a0a] bg-[#fafafa]"
                    : "border-[#eaeaea] hover:border-[#ccc]"
                }`}
              >
                <span className="block text-[13px] font-medium text-[#0a0a0a]">{t.label}</span>
              </button>
            ))}
          </div>

          <label className="block text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-1.5">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What they'll see in their inbox"
            className="w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#0070f3] mb-4"
          />

          <label className="block text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-1.5">Headline</label>
          <input
            value={content.headline}
            onChange={(e) => setContent((p) => ({ ...p, headline: e.target.value }))}
            placeholder="The one line at the top"
            className="w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#0070f3] mb-4"
          />

          <label className="block text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-1.5">Message</label>
          <textarea
            value={content.body}
            onChange={(e) => setContent((p) => ({ ...p, body: e.target.value }))}
            rows={10}
            placeholder="A blank line starts a new paragraph."
            className="w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm leading-relaxed text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#0070f3] mb-4"
          />

          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[10px] font-semibold text-[#999] uppercase tracking-widest">
              Details <span className="text-[#ccc] normal-case tracking-normal">· the facts at a glance</span>
            </label>
            <button
              type="button"
              onClick={() => setContent((p) => ({ ...p, details: [...p.details, { label: "", value: "" }] }))}
              className="text-[11px] font-medium text-[#0070f3] hover:underline"
            >
              Add a row
            </button>
          </div>
          <div className="space-y-2 mb-4">
            {content.details.length === 0 && (
              <p className="text-[11px] text-[#bbb] px-3 py-2 border border-dashed border-[#eaeaea] rounded-lg">
                None. Good for news; an outage usually wants an area and a time.
              </p>
            )}
            {content.details.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={d.label}
                  onChange={(e) => setDetail(i, { label: e.target.value })}
                  placeholder="Label"
                  className="w-32 shrink-0 border border-[#eaeaea] rounded-lg px-2.5 py-1.5 text-xs text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#0070f3]"
                />
                <input
                  value={d.value}
                  onChange={(e) => setDetail(i, { value: e.target.value })}
                  placeholder="Value"
                  className="flex-1 border border-[#eaeaea] rounded-lg px-2.5 py-1.5 text-xs text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#0070f3]"
                />
                <button
                  type="button"
                  onClick={() => setContent((p) => ({ ...p, details: p.details.filter((_, x) => x !== i) }))}
                  data-tip="Remove"
                  className="p-1.5 rounded-md text-[#999] hover:bg-[#f5f5f5] hover:text-[#dc2626] transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <label className="block text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-1.5">
            Button <span className="text-[#ccc] normal-case tracking-normal">· optional</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              value={content.cta?.label ?? ""}
              onChange={(e) =>
                setContent((p) => ({ ...p, cta: { label: e.target.value, url: p.cta?.url ?? "" } }))
              }
              placeholder="Label"
              className="w-32 shrink-0 border border-[#eaeaea] rounded-lg px-2.5 py-1.5 text-xs text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#0070f3]"
            />
            <input
              value={content.cta?.url ?? ""}
              onChange={(e) =>
                setContent((p) => ({ ...p, cta: { label: p.cta?.label ?? "", url: e.target.value } }))
              }
              placeholder="https://… or mailto:…"
              className="flex-1 border border-[#eaeaea] rounded-lg px-2.5 py-1.5 text-xs text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#0070f3]"
            />
          </div>
        </section>
      </div>

      {/* ── Preview and send ──────────────────────────────────────── */}
      <div className="lg:sticky lg:top-4 space-y-4">
        <section className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#eaeaea]">
            <p className="text-sm font-semibold text-[#0a0a0a]">Preview</p>
            <p className="text-[11px] text-[#999] truncate">
              as {included[0]?.company ?? "a customer"} would see it
            </p>
          </div>
          <iframe
            title="Email preview"
            srcDoc={preview}
            className="w-full h-[460px] border-0 bg-white"
            sandbox=""
          />
        </section>

        <section className="bg-white border border-[#eaeaea] rounded-xl p-5">
          {placeholders.length > 0 && (
            <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg bg-[#fffbeb] border border-[#fde68a]">
              <AlertTriangle className="w-3.5 h-3.5 text-[#b45309] shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-[#92400e]">
                Still to fill in: {placeholders.join(", ")}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={sendTest}
              disabled={testing || noMessage}
              className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[13px] font-medium text-[#0a0a0a] px-3 py-2 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              Send me a test
            </button>
            <button
              type="button"
              onClick={send}
              disabled={sending || noMessage || recipients.length === 0}
              className="flex items-center gap-1.5 bg-[#0a0a0a] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send to {recipients.length}
            </button>
          </div>

          <p className="text-[11px] text-[#999] mt-3 leading-relaxed">
            Sent one at a time, so nobody sees anyone else&apos;s address. Replies go to the ticket
            mailbox and open a ticket. {authUser?.displayName ? `Signed as ${authUser.displayName}.` : ""}
          </p>
        </section>
      </div>
    </div>
  );
}
