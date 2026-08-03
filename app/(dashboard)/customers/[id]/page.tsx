"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import CopyButton from "@/components/ui/CopyButton";
import CustomerUnifiPanel from "@/components/customers/CustomerUnifiPanel";
import EditCustomerDetailsDrawer from "@/components/customers/EditCustomerDetailsDrawer";
import { getCustomerProfile, DEFAULT_CONTACT_ID, type CustomerProfileOverlay } from "@/lib/db/customer-profiles";
import { subscribeProjects } from "@/lib/db/projects";
import { statusConfig, type Project } from "@/lib/mock-projects";
import { matchScore, LIKELY_MATCH_THRESHOLD } from "@/lib/name-match";
import {
  ArrowLeft, RefreshCw, AlertCircle, Building2, Phone, User,
  Smartphone, ListOrdered, Wifi, Pencil, FolderKanban, ArrowUpRight,
  ChevronLeft, ChevronRight, Mail,
} from "lucide-react";

interface PortalCustomer {
  id: string;
  parentId: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  status: string;
  balance: string;
  creditLimit: string;
}

interface Device {
  aor?: string;
  aor_user?: string;
  model?: string;
  mac?: string;
  sub_fullname?: string;
  sub_login?: string;
  expires?: string;
  registration_time?: string;
  nat_wan?: string;
}

interface Subscriber {
  user?: string;
  first_name?: string;
  last_name?: string;
  subscriber_login?: string;
  email?: string;
  scope?: string;
  presence?: string;
  account_status?: string;
}

interface DIDNumber {
  matchrule?: string;
  domain_owner?: string;
  plan_description?: string;
}

// The customer's actual owned number lives in "matchrule" (e.g. "sip:18056582233@*")
// — "to_user" is just the call's routing destination (often a short ring-group
// extension like "500", or a different number for call-forwarding), not the DID itself.
function numberFromMatchrule(matchrule?: string): string | null {
  const m = matchrule?.match(/^sip:(\d+)@/);
  return m ? m[1] : null;
}

type GenericRow = Record<string, unknown>;

interface CustomerDetail {
  customer: PortalCustomer;
}

type ResourceStatus = "loading" | "ok" | "error";
interface ResourceState<T> {
  status: ResourceStatus;
  items: T[];
}

function emptyResource<T>(): ResourceState<T> {
  return { status: "loading", items: [] };
}

async function fetchResource<T>(url: string): Promise<ResourceState<T>> {
  try {
    const res = await fetch(url);
    // Not configured — same as the old server-side fallback, treat as empty rather than an error.
    if (res.status === 503) return { status: "ok", items: [] };
    if (!res.ok) return { status: "error", items: [] };
    const json = await res.json();
    // NetSapiens returns bare `null` (not `[]`) for some list actions when
    // there are zero results, so a non-array response still needs the fallback.
    const items: T[] = Array.isArray(json) ? json : (json?.data ?? []);
    return { status: "ok", items };
  } catch {
    return { status: "error", items: [] };
  }
}

function Field({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium text-[#0a0a0a] truncate">{value || "-"}</p>
        {copy && value && <CopyButton value={value} label={label} />}
      </div>
    </div>
  );
}

interface ContactCardData {
  id: string;
  name: string;
  designation: string;
  email: string;
  phone: string;
}

function ContactCarousel({ contacts, mainContactId }: { contacts: ContactCardData[]; mainContactId: string }) {
  const initialIndex = Math.max(contacts.findIndex((c) => c.id === mainContactId), 0);
  const [index, setIndex] = useState(initialIndex);
  const current = contacts[index] ?? contacts[0];

  return (
    <div className="border border-[#eaeaea] rounded-xl p-4 bg-[#fafafa] w-full max-w-xs flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">
          Contact{contacts.length > 1 ? ` (${index + 1}/${contacts.length})` : ""}
        </p>
        {contacts.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIndex((i) => (i - 1 + contacts.length) % contacts.length)}
              className="p-1 rounded-md text-[#999] hover:bg-[#eee] hover:text-[#0a0a0a] transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIndex((i) => (i + 1) % contacts.length)}
              className="p-1 rounded-md text-[#999] hover:bg-[#eee] hover:text-[#0a0a0a] transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-[#0a0a0a] truncate">{current.name || "-"}</p>
          {current.id === mainContactId && (
            <span className="shrink-0 text-[9px] font-semibold text-[#0070f3] bg-[#e8f2ff] px-1.5 py-0.5 rounded-full uppercase tracking-wide">Main</span>
          )}
        </div>
        {current.designation && <p className="text-xs text-[#999] mb-3">{current.designation}</p>}

        <div className="space-y-1.5 mt-3">
          <div className="flex items-center gap-1.5 text-xs text-[#666]">
            <Phone className="w-3 h-3 shrink-0" />
            <span className="truncate">{current.phone || "-"}</span>
            {current.phone && <CopyButton value={current.phone} label="phone" />}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#666]">
            <Mail className="w-3 h-3 shrink-0" />
            <span className="truncate">{current.email || "-"}</span>
            {current.email && <CopyButton value={current.email} label="email" />}
          </div>
        </div>
      </div>

      {contacts.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3 pt-3 border-t border-[#f0f0f0]">
          {contacts.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setIndex(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? "bg-[#0070f3]" : "bg-[#ddd] hover:bg-[#bbb]"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type ViewState = "loading" | "unconfigured" | "error" | "notfound" | "ok";

const TABS = [
  { key: "numbers", label: "Numbers", icon: Phone },
  { key: "extensions", label: "Extensions", icon: User },
  { key: "queues", label: "Call Queues", icon: ListOrdered },
  { key: "devices", label: "Devices", icon: Smartphone },
  { key: "unifi", label: "Network", icon: Wifi },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function isOpenStatus(status: string) {
  return status.toLowerCase() === "open";
}

function formatNumber(n: string) {
  const d = n.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) {
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return n;
}

function SectionPending({ status, onRetry }: { status: "loading" | "error"; onRetry: () => void }) {
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#999]">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading…
      </div>
    );
  }
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-[#f31260] mb-2">Failed to load.</p>
      <button onClick={onRetry} className="text-xs text-[#0070f3] hover:underline">Retry</button>
    </div>
  );
}

function GenericTable({ rows, emptyLabel }: { rows: GenericRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-[#999] px-5 py-6 text-center">{emptyLabel}</p>;
  }
  const columns = Object.keys(rows[0]).slice(0, 6);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-140">
        <thead>
          <tr className="border-b border-[#eaeaea]">
            {columns.map((col) => (
              <th key={col} className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">
                {col.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
              {columns.map((col) => (
                <td key={col} className="px-5 py-3 text-sm text-[#666]">{String(row[col] ?? "-")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [state, setState] = useState<ViewState>("loading");
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [cachedCustomer, setCachedCustomer] = useState<PortalCustomer | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("numbers");
  const [overlay, setOverlay] = useState<CustomerProfileOverlay | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [devicesRes, setDevicesRes] = useState<ResourceState<Device>>(emptyResource);
  const [subscribersRes, setSubscribersRes] = useState<ResourceState<Subscriber>>(emptyResource);
  const [phoneNumbersRes, setPhoneNumbersRes] = useState<ResourceState<DIDNumber>>(emptyResource);
  const [queuesRes, setQueuesRes] = useState<ResourceState<GenericRow>>(emptyResource);

  async function load() {
    setState("loading");
    try {
      const res = await fetch(`/api/ringlogix/customers/${id}`);
      if (res.status === 503) { setState("unconfigured"); return; }
      if (res.status === 404) { setState("notfound"); return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const json: CustomerDetail = await res.json();
      setData(json);
      setState("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setState("error");
    }
  }

  // Each tab's data comes from its own endpoint and loads independently — a
  // slow one (e.g. call queues) no longer blocks the others from rendering.
  function loadSections() {
    setDevicesRes({ status: "loading", items: [] });
    setSubscribersRes({ status: "loading", items: [] });
    setPhoneNumbersRes({ status: "loading", items: [] });
    setQueuesRes({ status: "loading", items: [] });
    fetchResource<Device>(`/api/ringlogix/devices?domain=${id}`).then(setDevicesRes);
    fetchResource<Subscriber>(`/api/ringlogix/subscribers?domain=${id}`).then(setSubscribersRes);
    fetchResource<DIDNumber>(`/api/ringlogix/dids?domain=${id}`).then(setPhoneNumbersRes);
    fetchResource<GenericRow>(`/api/ringlogix/queues?domain=${id}`).then(setQueuesRes);
  }

  useEffect(() => {
    // The customers list page caches its full fetch to localStorage — reuse it so
    // the overview renders instantly instead of blocking on devices/subscribers/etc.
    try {
      const raw = localStorage.getItem("sc:customers");
      if (raw) {
        const found = (JSON.parse(raw) as PortalCustomer[]).find((c) => c.id === id);
        if (found) setCachedCustomer(found);
      }
    } catch {}
    load();
    loadSections();
    getCustomerProfile(id).then(setOverlay).catch((err) => {
      const message = err instanceof Error ? err.message : (err?.message ?? String(err));
      console.error(`[CustomerDetailPage] Failed to load profile overlay: ${message}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    return subscribeProjects(setProjects);
  }, []);

  const backAction = (
    <Link
      href="/customers"
      className="flex items-center gap-2 border border-[#eaeaea] text-sm font-medium text-[#444] px-3 py-2 rounded-lg hover:bg-[#fafafa] hover:text-[#0a0a0a] transition-colors"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      Back to Customers
    </Link>
  );

  // Only the cached (or freshly fetched) customer record is needed to render
  // the header/overview — fall back to a full-page state when we have neither.
  const customer = data?.customer ?? cachedCustomer;

  if (!customer) {
    if (state === "loading") {
      return (
        <div>
          <Header title="Customer" subtitle={id} actions={backAction} />
          <div className="flex items-center justify-center py-32 text-sm text-[#999]">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            Loading customer…
          </div>
        </div>
      );
    }

    return (
      <div>
        <Header title="Customer" subtitle={id} actions={backAction} />
        <div className="bg-white border border-[#eaeaea] rounded-xl p-12 text-center">
          <AlertCircle className="w-6 h-6 text-[#f5a524] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#0a0a0a] mb-1">
            {state === "unconfigured" && "Portal login not configured"}
            {state === "notfound" && "Customer not found"}
            {state === "error" && "Failed to load"}
          </p>
          {state === "error" && <p className="text-xs text-[#999] mb-4">{error}</p>}
          <button onClick={load} className="text-xs text-[#0070f3] hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  const open = isOpenStatus(customer.status);
  const devices = devicesRes.items;
  const subscribers = subscribersRes.items;
  const queues = queuesRes.items;

  // Every row is a dial-plan rule, not necessarily an owned DID — skip rows
  // whose matchrule doesn't resolve to a real number, and dedupe by that
  // number (the same DID can have multiple routing rules).
  const phoneNumbers = Array.from(
    new Map(
      phoneNumbersRes.items
        .map((p) => [numberFromMatchrule(p.matchrule), p] as const)
        .filter((entry): entry is [string, DIDNumber] => entry[0] !== null && entry[0].length >= 10)
    ).values()
  );

  const defaultContact = { name: customer.contact, email: customer.email, phone: customer.phone };
  const allContacts = [
    { id: DEFAULT_CONTACT_ID, name: defaultContact.name, designation: "Primary Contact", email: defaultContact.email, phone: defaultContact.phone },
    ...(overlay?.contacts ?? []),
  ];
  const mainContact = allContacts.find((c) => c.id === (overlay?.mainContactId ?? DEFAULT_CONTACT_ID)) ?? allContacts[0];

  // Best-effort link to an in-progress project for this customer — projects
  // only store a free-text clientName (no RingLogix customer id), so this is
  // a fuzzy name match rather than a reliable foreign key.
  const ongoingProject = projects
    .filter((p) => p.status !== "completed" && p.status !== "cancelled" && p.clientName)
    .map((p) => ({ project: p, score: matchScore(customer.company, p.clientName!) }))
    .filter((m) => m.score >= LIKELY_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)[0]?.project;

  return (
    <div>
      <Header title={customer.company} subtitle={`Domain ${customer.id}`} actions={backAction} />

      {/* Overview */}
      <div className="bg-white border border-[#eaeaea] rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#e8f2ff] flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-[#0070f3]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#0a0a0a] leading-tight">{customer.company}</h2>
              <p className="text-xs text-[#999] mt-0.5">Domain {customer.id} · Territory {customer.parentId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${open ? "bg-[#e8fdf0] text-[#17c964]" : "bg-[#fdeaea] text-[#f31260]"}`}>
              {open ? "Active" : (customer.status || "Unknown")}
            </span>
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          </div>
        </div>

        {ongoingProject && (
          <Link
            href={`/projects/${ongoingProject.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 mb-5 rounded-lg border border-[#eaeaea] bg-[#fafafa] hover:bg-[#f2f2f2] transition-colors group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <FolderKanban className="w-4 h-4 text-[#0070f3] shrink-0" />
              <p className="text-sm text-[#0a0a0a] truncate">
                Ongoing project: <span className="font-medium">{ongoingProject.name}</span>
              </p>
              <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusConfig[ongoingProject.status].bg} ${statusConfig[ongoingProject.status].text}`}>
                {statusConfig[ongoingProject.status].label}
              </span>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-[#999] group-hover:text-[#0a0a0a] transition-colors shrink-0" />
          </Link>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-5 border-t border-[#f0f0f0]">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <Field label="Internet Service Provider" value={overlay?.isp ?? ""} />
            <Field label="Backup Internet Service Provider" value={overlay?.backupIsp ?? ""} />
            <Field label="Balance" value={customer.balance} />
            <Field label="Credit Limit" value={customer.creditLimit} />
          </div>

          <div className="flex lg:justify-end">
            <ContactCarousel key={`${mainContact.id}-${allContacts.length}`} contacts={allContacts} mainContactId={mainContact.id} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 mt-5 pt-5 border-t border-[#f0f0f0]">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-[#17c964]" />
            <span className="text-sm font-semibold text-[#0a0a0a]">{phoneNumbersRes.status === "ok" ? phoneNumbers.length : "…"}</span>
            <span className="text-sm text-[#666]">Numbers</span>
          </div>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#7c3aed]" />
            <span className="text-sm font-semibold text-[#0a0a0a]">{subscribersRes.status === "ok" ? subscribers.length : "…"}</span>
            <span className="text-sm text-[#666]">Extensions</span>
          </div>
          <div className="flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-[#f5a524]" />
            <span className="text-sm font-semibold text-[#0a0a0a]">{queuesRes.status === "ok" ? queues.length : "…"}</span>
            <span className="text-sm text-[#666]">Call Queues</span>
          </div>
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[#0070f3]" />
            <span className="text-sm font-semibold text-[#0a0a0a]">{devicesRes.status === "ok" ? devices.length : "…"}</span>
            <span className="text-sm text-[#666]">Devices</span>
          </div>
        </div>
      </div>

      <EditCustomerDetailsDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        customerId={id}
        defaultContact={defaultContact}
        overlay={overlay}
        onSaved={setOverlay}
      />

      {/* Numbers / Extensions / Call Queues / Devices / Network */}
      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex items-center gap-1 px-3 pt-2 border-b border-[#eaeaea] overflow-x-auto">
          {TABS.map((tab) => {
            const count =
              tab.key === "numbers" ? (phoneNumbersRes.status === "ok" ? phoneNumbers.length : null) :
              tab.key === "extensions" ? (subscribersRes.status === "ok" ? subscribers.length : null) :
              tab.key === "queues" ? (queuesRes.status === "ok" ? queues.length : null) :
              tab.key === "devices" ? (devicesRes.status === "ok" ? devices.length : null) :
              null;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  isActive ? "border-[#0070f3] text-[#0a0a0a]" : "border-transparent text-[#666] hover:text-[#0a0a0a]"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {count !== null && <span className="text-xs text-[#999]">({count})</span>}
              </button>
            );
          })}
        </div>

        {activeTab === "numbers" && (
          phoneNumbersRes.status !== "ok" ? (
            <SectionPending status={phoneNumbersRes.status === "error" ? "error" : "loading"} onRetry={loadSections} />
          ) : phoneNumbers.length === 0 ? (
            <p className="text-sm text-[#999] px-5 py-6 text-center">No phone numbers assigned.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-140">
                <thead>
                  <tr className="border-b border-[#eaeaea]">
                    <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Numbers</th>
                    <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {phoneNumbers.map((p, i) => {
                    const number = numberFromMatchrule(p.matchrule);
                    return (
                    <tr key={i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                      <td className="px-5 py-3 text-sm font-medium text-[#0a0a0a]">
                        <div className="flex items-center gap-1.5">
                          {number ? formatNumber(number) : "-"}
                          {number && <CopyButton value={number} label="number" />}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-[#666]">{p.plan_description || "-"}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {activeTab === "extensions" && (
          subscribersRes.status !== "ok" ? (
            <SectionPending status={subscribersRes.status === "error" ? "error" : "loading"} onRetry={loadSections} />
          ) : subscribers.length === 0 ? (
            <p className="text-sm text-[#999] px-5 py-6 text-center">No extensions found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-140">
                <thead>
                  <tr className="border-b border-[#eaeaea]">
                    <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Ext</th>
                    <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Name</th>
                    <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Login</th>
                    <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Email</th>
                    <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Scope</th>
                    <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map((s, i) => (
                    <tr key={i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                      <td className="px-5 py-3 text-sm font-medium text-[#0a0a0a]">{s.user || "-"}</td>
                      <td className="px-5 py-3 text-sm text-[#666]">{[s.first_name, s.last_name].filter(Boolean).join(" ") || "-"}</td>
                      <td className="px-5 py-3 text-sm text-[#666]">{s.subscriber_login || "-"}</td>
                      <td className="px-5 py-3 text-sm text-[#666]">{s.email || "-"}</td>
                      <td className="px-5 py-3 text-sm text-[#666]">{s.scope || "-"}</td>
                      <td className="px-5 py-3 text-sm text-[#666]">{s.account_status || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {activeTab === "queues" && (
          queuesRes.status !== "ok" ? (
            <SectionPending status={queuesRes.status === "error" ? "error" : "loading"} onRetry={loadSections} />
          ) : (
            <GenericTable rows={queues} emptyLabel="No call queues configured." />
          )
        )}

        {activeTab === "devices" && (
          devicesRes.status !== "ok" ? (
            <SectionPending status={devicesRes.status === "error" ? "error" : "loading"} onRetry={loadSections} />
          ) : devices.length === 0 ? (
            <p className="text-sm text-[#999] px-5 py-6 text-center">No devices registered.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-140">
                <thead>
                  <tr className="border-b border-[#eaeaea]">
                    <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Owner</th>
                    <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Name</th>
                    <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Model</th>
                    <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">MAC Address</th>
                    <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d, i) => (
                    <tr key={i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                      <td className="px-5 py-3 text-sm font-medium text-[#0a0a0a]">{d.aor_user || "-"}</td>
                      <td className="px-5 py-3 text-sm text-[#666]">{d.sub_fullname || "-"}</td>
                      <td className="px-5 py-3 text-sm text-[#666]">{d.model || "-"}</td>
                      <td className="px-5 py-3 text-sm text-[#666] font-mono">{d.mac ? d.mac.toUpperCase() : "-"}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${d.expires ? "bg-[#e8fdf0] text-[#17c964]" : "bg-[#f1f1f1] text-[#999]"}`}>
                          {d.expires ? "Registered" : "Offline"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {activeTab === "unifi" && (
          <CustomerUnifiPanel customerId={id} companyName={customer.company} bare />
        )}
      </div>
    </div>
  );
}
