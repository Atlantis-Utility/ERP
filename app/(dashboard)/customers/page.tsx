"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import CopyButton from "@/components/ui/CopyButton";
import Select from "@/components/ui/Select";
import DownloadMenu from "@/components/ui/DownloadMenu";
import { customerStatusKey, balanceAmount, creditLimitAmount, type CustomerStatusKey } from "@/lib/customer-status";
import { listUnifiLinks } from "@/lib/db/unifi-links";
import { exportToCsv, exportToPdf } from "@/lib/export";
import { Building2, RefreshCw, AlertCircle, Search, Wifi, DollarSign } from "lucide-react";

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

type ViewState = "loading" | "unconfigured" | "error" | "ok";
type StatusFilter = "all" | CustomerStatusKey;
type SortKey = "balance-desc" | "balance-asc" | "credit-desc" | "credit-asc" | "company-asc" | "company-desc";
type UnifiFilter = "all" | "linked" | "unlinked";
type PaymentFilter = "all" | "unpaid";

const STATUS_CONFIG: Record<CustomerStatusKey, { label: string; bg: string; text: string }> = {
  open:        { label: "Open",        bg: "bg-[#e8fdf0]", text: "text-[#17c964]" },
  suspended:   { label: "Suspended",   bg: "bg-[#fff8e6]", text: "text-[#b45309]" },
  terminated:  { label: "Terminated",  bg: "bg-[#fdeaea]", text: "text-[#f31260]" },
  other:       { label: "Unknown",     bg: "bg-[#f1f1f1]", text: "text-[#999]" },
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "balance-desc", label: "Balance Owed: High to Low" },
  { value: "balance-asc",  label: "Balance Owed: Low to High" },
  { value: "credit-desc",  label: "Credit Limit: High to Low" },
  { value: "credit-asc",   label: "Credit Limit: Low to High" },
  { value: "company-asc",  label: "Company: A to Z" },
  { value: "company-desc", label: "Company: Z to A" },
];

export default function CustomersPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [customers, setCustomers] = useState<PortalCustomer[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("balance-desc");
  const [unifiFilter, setUnifiFilter] = useState<UnifiFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());

  async function load(silent = false) {
    if (!silent) setState("loading");
    try {
      const res = await fetch("/api/ringlogix/customers");
      if (res.status === 503) { if (!silent) setState("unconfigured"); return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      const arr: PortalCustomer[] = Array.isArray(data) ? data : (data.data ?? []);
      setCustomers(arr);
      setState("ok");
      try { localStorage.setItem("sc:customers", JSON.stringify(arr)); } catch {}
    } catch (e) {
      if (!silent) { setError(e instanceof Error ? e.message : "Failed to load"); setState("error"); }
    }
  }

  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:customers");
      if (c) { setCustomers(JSON.parse(c)); setState("ok"); load(true); }
      else load();
    } catch { load(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listUnifiLinks()
      .then((links) => setLinkedIds(new Set(links.map((l) => l.customerId))))
      .catch(() => {});
  }, []);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      c.company?.toLowerCase().includes(q) ||
      c.contact?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || customerStatusKey(c.status) === statusFilter;
    const isLinked = linkedIds.has(c.id);
    const matchesUnifi = unifiFilter === "all" || (unifiFilter === "linked" ? isLinked : !isLinked);
    const matchesPayment = paymentFilter === "all" || balanceAmount(c.balance) > 0;
    return matchesSearch && matchesStatus && matchesUnifi && matchesPayment;
  });

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "balance-desc": return balanceAmount(b.balance) - balanceAmount(a.balance);
        case "balance-asc":  return balanceAmount(a.balance) - balanceAmount(b.balance);
        case "credit-desc":  return creditLimitAmount(b.creditLimit) - creditLimitAmount(a.creditLimit);
        case "credit-asc":   return creditLimitAmount(a.creditLimit) - creditLimitAmount(b.creditLimit);
        case "company-asc":  return a.company.localeCompare(b.company);
        case "company-desc": return b.company.localeCompare(a.company);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey]);

  const openCount = customers.filter((c) => customerStatusKey(c.status) === "open").length;
  const terminatedCount = customers.filter((c) => customerStatusKey(c.status) === "terminated").length;
  const totalOwed = customers.reduce((s, c) => s + Math.max(balanceAmount(c.balance), 0), 0);

  const EXPORT_HEADERS = ["Company", "Contact", "Email", "Phone", "Balance", "Credit Limit", "Status"];
  const exportRows = () => sorted.map((c) => [c.company || "-", c.contact || "-", c.email || "-", c.phone || "-", c.balance || "-", c.creditLimit || "-", c.status || "-"]);

  function handleExportCsv() {
    exportToCsv("customers.csv", EXPORT_HEADERS, exportRows());
  }

  function handleExportPdf() {
    exportToPdf("customers.pdf", "Customers", EXPORT_HEADERS, exportRows());
  }

  return (
    <div>
      <Header
        title="Customers"
        subtitle="RingLogix reseller account directory"
        actions={
          <DownloadMenu
            onExportCsv={handleExportCsv}
            onExportPdf={handleExportPdf}
            disabled={state !== "ok" || sorted.length === 0}
          />
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:flex md:items-stretch md:divide-x divide-[#f4f4f4] bg-white border border-[#eaeaea] rounded-xl mb-5 overflow-hidden">
        {[
          { label: "Total Customers", value: state === "ok" ? customers.length : "-" },
          { label: "Open", value: state === "ok" ? openCount : "-" },
          { label: "Terminated", value: state === "ok" ? terminatedCount : "-" },
          { label: "Balance Owed", value: state === "ok" ? `$${totalOwed.toFixed(2)}` : "-" },
        ].map((k, i, arr) => (
          <div key={k.label} className={`px-4 py-4 md:flex-1 md:px-5 md:py-5 ${i < arr.length - 1 ? "border-b md:border-b-0 border-[#f4f4f4]" : ""}`}>
            <p className="text-2xl font-bold tabular-nums leading-none text-[#0a0a0a]">{k.value}</p>
            <p className="text-[11px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
          <input
            type="text"
            placeholder="Search by company, contact, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-[#eaeaea] rounded-lg pl-9 pr-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#0070f3] transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {([
            { value: "all", label: "All" },
            { value: "open", label: "Open" },
            { value: "suspended", label: "Suspended" },
            { value: "terminated", label: "Terminated" },
          ] as const).map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                statusFilter === f.value
                  ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                  : "bg-white text-[#666] border-[#eaeaea] hover:border-[#ccc]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-56">
          <Select
            value={sortKey}
            onChange={(v) => setSortKey(v as SortKey)}
            options={SORT_OPTIONS}
          />
        </div>

        <div className="flex items-center gap-1 bg-[#f5f5f5] rounded-lg p-0.5">
          {([
            { value: "all", label: "All" },
            { value: "linked", label: "Linked" },
            { value: "unlinked", label: "Unlinked" },
          ] as const).map((f) => (
            <button
              key={f.value}
              onClick={() => setUnifiFilter(f.value)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                unifiFilter === f.value
                  ? "bg-white text-[#0a0a0a] shadow-sm"
                  : "text-[#888] hover:text-[#333]"
              }`}
            >
              <Wifi className="w-3 h-3" />
              {f.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setPaymentFilter(paymentFilter === "unpaid" ? "all" : "unpaid")}
          title="Balance owed > 0 — RingLogix only exposes a running balance, not per-invoice payment dates, so this can't be scoped to a specific month"
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            paymentFilter === "unpaid"
              ? "bg-[#fdeaea] text-[#f31260] border-[#f9c9c9]"
              : "bg-white text-[#666] border-[#eaeaea] hover:border-[#ccc]"
          }`}
        >
          <DollarSign className="w-3 h-3" />
          Unpaid Balance
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl">
        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Syncing from RingLogix…</p>
          </div>
        )}

        {state === "unconfigured" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f5a524] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">Portal login not configured</p>
            <p className="text-xs text-[#999]">Add <code className="bg-[#f1f1f1] px-1 rounded">RINGLOGIX_USERNAME</code> & <code className="bg-[#f1f1f1] px-1 rounded">RINGLOGIX_PASSWORD</code> to <code className="bg-[#f1f1f1] px-1 rounded">.env.local</code>, then restart the server.</p>
          </div>
        )}

        {state === "error" && (
          <div className="p-12 text-center">
            <AlertCircle className="w-6 h-6 text-[#f31260] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0a] mb-1">Failed to load</p>
            <p className="text-xs text-[#999] mb-4">{error}</p>
            <button onClick={() => load()} className="text-xs text-[#0070f3] hover:underline">Retry</button>
          </div>
        )}

        {state === "ok" && sorted.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-sm text-[#999]">No customers found{search || statusFilter !== "all" || unifiFilter !== "all" || paymentFilter !== "all" ? " matching your search or filter" : ""}.</p>
          </div>
        )}

        {state === "ok" && sorted.length > 0 && (
          <div className="overflow-x-auto">
          <table className="w-full min-w-160">
            <thead>
              <tr className="border-b border-[#eaeaea]">
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3 whitespace-nowrap">Company</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3 whitespace-nowrap">Contact</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3 whitespace-nowrap">Email</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3 whitespace-nowrap">Phone</th>
                <th className="text-right text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3 whitespace-nowrap">Balance</th>
                <th className="text-right text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3 whitespace-nowrap">Credit Limit</th>
                <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const cfg = STATUS_CONFIG[customerStatusKey(c.status)];
                return (
                  <tr key={`${c.id}-${c.parentId}`} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <Link href={`/customers/${c.id}`} className="flex items-center gap-2.5 group">
                        <div className="w-7 h-7 rounded-lg bg-[#e8f2ff] flex items-center justify-center shrink-0">
                          <Building2 className="w-3.5 h-3.5 text-[#0070f3]" />
                        </div>
                        <span className="text-sm font-medium text-[#0a0a0a] group-hover:text-[#0070f3] group-hover:underline">{c.company || "-"}</span>
                        {linkedIds.has(c.id) && (
                          <span title="UniFi site linked">
                            <Wifi className="w-3.5 h-3.5 text-[#16a34a] shrink-0" />
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-sm text-[#666] whitespace-nowrap">{c.contact || "-"}</td>
                    <td className="px-5 py-3 text-sm text-[#666] whitespace-nowrap">
                      {c.email ? (
                        <div className="flex items-center gap-1.5">
                          {c.email}
                          <CopyButton value={c.email} label="email" />
                        </div>
                      ) : "-"}
                    </td>
                    <td className="px-5 py-3 text-sm text-[#666] whitespace-nowrap">
                      {c.phone ? (
                        <div className="flex items-center gap-1.5">
                          {c.phone}
                          <CopyButton value={c.phone} label="phone" />
                        </div>
                      ) : "-"}
                    </td>
                    <td className="px-5 py-3 text-sm text-[#0a0a0a] font-medium whitespace-nowrap text-right">{c.balance || "-"}</td>
                    <td className="px-5 py-3 text-sm text-[#666] whitespace-nowrap text-right">{c.creditLimit || "-"}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.text}`}>
                        {c.status || cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
