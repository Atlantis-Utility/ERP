"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { GitBranch, RefreshCw, AlertCircle, Plus, X } from "lucide-react";

interface DialRule {
  matchrule?: string;
  to_user?: string;
  to_host?: string;
  responder?: string;
  parameter?: string;
  dow?: string;
  tod_from?: string;
  tod_to?: string;
  dialplan?: string;
  domain?: string;
  plan_description?: string;
}

interface Customer {
  domain: string;
  [key: string]: unknown;
}

interface DialPlan {
  dialplan: string;
  [key: string]: unknown;
}

type ViewState = "idle" | "loading" | "unconfigured" | "error" | "ok";

export default function DialRulesPage() {
  const [state, setState] = useState<ViewState>("idle");
  const [rules, setRules] = useState<DialRule[]>([]);
  const [error, setError] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [domain, setDomain] = useState("");
  const [dialplans, setDialplans] = useState<DialPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [matchRule, setMatchRule] = useState("");
  const [toUser, setToUser] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

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

  useEffect(() => {
    if (!domain) { setDialplans([]); setSelectedPlan(""); return; }
    fetch(`/api/ringlogix/dialplans?domain=${encodeURIComponent(domain)}`)
      .then((r) => r.json())
      .then((d) => {
        const arr: DialPlan[] = Array.isArray(d) ? d : (d?.data ?? []);
        setDialplans(arr);
        if (arr.length > 0) setSelectedPlan(arr[0].dialplan);
        else setSelectedPlan("");
      })
      .catch(() => { setDialplans([]); setSelectedPlan(""); });
  }, [domain]);

  const load = useCallback(async () => {
    if (!domain || !selectedPlan) return;
    setState("loading");
    try {
      const res = await fetch(`/api/ringlogix/dial-rules?domain=${encodeURIComponent(domain)}&dialplan=${encodeURIComponent(selectedPlan)}`);
      if (res.status === 503) { setState("unconfigured"); return; }
      const data = await res.json();
      if (data?.error === "not_configured") { setState("unconfigured"); return; }
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const arr: DialRule[] = Array.isArray(data) ? data : (data?.data ?? []);
      setRules(arr);
      setState("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setState("error");
    }
  }, [domain, selectedPlan]);

  const addRule = async () => {
    if (!matchRule.trim()) { setSaveError("Match rule is required."); return; }
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/ringlogix/dial-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchrule: matchRule, to_user: toUser, domain, dialplan: selectedPlan }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to add rule");
      }
      setShowModal(false);
      setMatchRule("");
      setToUser("");
      load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to add rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Header
        title="Dial Rules"
        subtitle="Dial plan routing rules"
        actions={
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#0070f3] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#005fcc] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Rule
          </button>
        }
      />

      {/* Domain + Plan selector */}
      <div className="bg-white border border-[#eaeaea] rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Domain</label>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors min-w-[180px] bg-white"
          >
            <option value="">Select domain…</option>
            {customers.map((c) => (
              <option key={c.domain} value={c.domain}>{c.domain}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Dial Plan</label>
          <select
            value={selectedPlan}
            onChange={(e) => setSelectedPlan(e.target.value)}
            disabled={dialplans.length === 0}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors min-w-[180px] bg-white disabled:opacity-50"
          >
            <option value="">Select plan…</option>
            {dialplans.map((p) => (
              <option key={p.dialplan} value={p.dialplan}>{p.dialplan}</option>
            ))}
          </select>
        </div>
        <button
          onClick={load}
          disabled={!domain || !selectedPlan || state === "loading"}
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
            <GitBranch className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? rules.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total Rules</p>
          <p className="text-xs text-[#999]">Dial plan routing rules</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">Dial Rules</p>
        </div>

        {state === "idle" && (
          <div className="p-12 text-center">
            <GitBranch className="w-6 h-6 text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Select a domain and dial plan, then click Load.</p>
          </div>
        )}

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Loading dial rules…</p>
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

        {state === "ok" && rules.length === 0 && (
          <div className="p-12 text-center">
            <GitBranch className="w-6 h-6 text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#999]">No dial rules found for this plan.</p>
          </div>
        )}

        {state === "ok" && rules.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#eaeaea] bg-[#fafafa]">
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Match Rule</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">To User</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">To Host</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Application</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Parameter</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Days</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r, i) => (
                  <tr key={(r.matchrule ?? "") + i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#e8f2ff] flex items-center justify-center shrink-0">
                          <GitBranch className="w-3.5 h-3.5 text-[#0070f3]" />
                        </div>
                        <span className="text-sm font-medium text-[#0a0a0a] font-mono">{r.matchrule || "-"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666] font-mono">{r.to_user || "-"}</td>
                    <td className="px-4 py-3 text-sm text-[#666]">{r.to_host || "-"}</td>
                    <td className="px-4 py-3">
                      {r.responder ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#f1f1f1] text-[#666]">{r.responder}</span>
                      ) : (
                        <span className="text-sm text-[#999]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666] font-mono">{r.parameter || "-"}</td>
                    <td className="px-4 py-3 text-sm text-[#666]">{r.dow || "-"}</td>
                    <td className="px-4 py-3 text-sm text-[#666]">
                      {r.tod_from && r.tod_to ? `${r.tod_from} - ${r.tod_to}` : (r.tod_from || r.tod_to || "-")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Rule Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#eaeaea]">
              <p className="text-sm font-semibold text-[#0a0a0a]">Add Dial Rule</p>
              <button onClick={() => { setShowModal(false); setSaveError(""); }} className="p-1 rounded-lg hover:bg-[#f5f5f5] transition-colors text-[#999]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Match Rule *</label>
                <input
                  type="text"
                  placeholder="e.g. ^1([0-9]{10})$"
                  value={matchRule}
                  onChange={(e) => setMatchRule(e.target.value)}
                  className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors w-full font-mono"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Destination User (to_user)</label>
                <input
                  type="text"
                  placeholder="e.g. 1\\1"
                  value={toUser}
                  onChange={(e) => setToUser(e.target.value)}
                  className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors w-full font-mono"
                />
              </div>
              {saveError && <p className="text-xs text-[#f31260]">{saveError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#eaeaea]">
              <button onClick={() => { setShowModal(false); setSaveError(""); }} className="text-sm border border-[#eaeaea] bg-white text-[#0a0a0a] font-medium px-4 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors">Cancel</button>
              <button onClick={addRule} disabled={saving} className="text-sm bg-[#0070f3] text-white font-medium px-4 py-1.5 rounded-lg hover:bg-[#005fcc] transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Add Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
