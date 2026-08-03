"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import Select from "@/components/ui/Select";
import { Building2, RefreshCw, AlertCircle } from "lucide-react";

interface Department {
  user: string;
  domain: string;
  first_name?: string;
  last_name?: string;
  dir_list?: string;
  dir_anc?: string;
}

interface Customer {
  domain: string;
  [key: string]: unknown;
}

type ViewState = "idle" | "loading" | "unconfigured" | "error" | "ok";

export default function DepartmentsPage() {
  const [state, setState] = useState<ViewState>("idle");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [domain, setDomain] = useState("");

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
    if (!domain) return;
    setState("loading");
    try {
      const res = await fetch(`/api/ringlogix/departments?domain=${encodeURIComponent(domain)}`);
      if (res.status === 503) { setState("unconfigured"); return; }
      const data = await res.json();
      if (data?.error === "not_configured") { setState("unconfigured"); return; }
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const arr: Department[] = Array.isArray(data) ? data : (data?.data ?? []);
      setDepartments(arr);
      setState("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setState("error");
    }
  }, [domain]);

  return (
    <div>
      <Header
        title="Departments"
        subtitle="Directory listings and department entries"
      />

      {/* Domain selector */}
      <div className="bg-white border border-[#eaeaea] rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 w-45">
          <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Domain</label>
          <Select
            value={domain}
            onChange={setDomain}
            placeholder="Select domain…"
            options={customers.map((c) => ({ value: c.domain, label: c.domain }))}
          />
        </div>
        <button
          onClick={load}
          disabled={!domain || state === "loading"}
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
            <Building2 className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? departments.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Departments</p>
          <p className="text-xs text-[#999]">Directory entries</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">All Departments</p>
        </div>

        {state === "idle" && (
          <div className="p-12 text-center">
            <Building2 className="w-6 h-6 text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Select a domain, then click Load.</p>
          </div>
        )}

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Loading departments…</p>
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

        {state === "ok" && departments.length === 0 && (
          <div className="p-12 text-center">
            <Building2 className="w-6 h-6 text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#999]">No departments found for this domain.</p>
          </div>
        )}

        {state === "ok" && departments.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#eaeaea] bg-[#fafafa]">
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Extension / User</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">First Name</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Last Name</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Directory Listed</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Dir ANC</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d, i) => (
                  <tr key={(d.user ?? "") + i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#e8f2ff] flex items-center justify-center shrink-0">
                          <Building2 className="w-3.5 h-3.5 text-[#0070f3]" />
                        </div>
                        <span className="text-sm font-medium text-[#0a0a0a] font-mono">{d.user || "-"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666]">{d.first_name || "-"}</td>
                    <td className="px-4 py-3 text-sm text-[#666]">{d.last_name || "-"}</td>
                    <td className="px-4 py-3">
                      {d.dir_list ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#e8fdf0] text-[#17c964]">{d.dir_list}</span>
                      ) : (
                        <span className="text-sm text-[#999]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666]">{d.dir_anc || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
