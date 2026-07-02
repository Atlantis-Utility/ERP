"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { AlarmClock, Clock, CheckCircle, RefreshCw, AlertCircle, Plus, X, Trash2 } from "lucide-react";

interface CallRequest {
  request_id: string;
  request?: string;
  request_status?: string;
  orig_address?: string;
  orig_name?: string;
  dest_address?: string;
  dest_name?: string;
  time_of_request?: string;
  time_to_call?: string;
  message?: string;
}

interface Customer {
  domain: string;
  [key: string]: unknown;
}

type ViewState = "idle" | "loading" | "unconfigured" | "error" | "ok";
type ScheduleMode = "specific" | "relative";

export default function WakeUpCallsPage() {
  const [state, setState] = useState<ViewState>("idle");
  const [calls, setCalls] = useState<CallRequest[]>([]);
  const [error, setError] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [domain, setDomain] = useState("");
  const [user, setUser] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("specific");
  const [uid, setUid] = useState("");
  const [specificTime, setSpecificTime] = useState("");
  const [relDays, setRelDays] = useState("0");
  const [relHours, setRelHours] = useState("0");
  const [relMinutes, setRelMinutes] = useState("30");
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

  const load = useCallback(async () => {
    setState("loading");
    try {
      const params = new URLSearchParams();
      if (domain) params.set("domain", domain);
      if (user) params.set("user", user);
      const res = await fetch(`/api/ringlogix/wake-up-calls${params.toString() ? "?" + params.toString() : ""}`);
      if (res.status === 503) { setState("unconfigured"); return; }
      const data = await res.json();
      if (data?.error === "not_configured") { setState("unconfigured"); return; }
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const arr: CallRequest[] = Array.isArray(data) ? data : (data?.data ?? []);
      setCalls(arr);
      setState("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setState("error");
    }
  }, [domain, user]);

  useEffect(() => { load(); }, [load]);

  const deleteCall = async (c: CallRequest) => {
    if (!confirm(`Delete wake-up call ${c.request_id}?`)) return;
    try {
      const res = await fetch("/api/ringlogix/wake-up-calls", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: c.orig_address, requestId: c.request_id }),
      });
      if (res.ok) setCalls((prev) => prev.filter((x) => x.request_id !== c.request_id));
    } catch {}
  };

  const scheduleCall = async () => {
    if (!uid.trim()) { setSaveError("UID is required (user@domain)."); return; }
    setSaving(true);
    setSaveError("");
    try {
      const body: Record<string, unknown> = { uid };
      if (scheduleMode === "specific") {
        body.time = specificTime;
      } else {
        body.days = parseInt(relDays, 10) || 0;
        body.hours = parseInt(relHours, 10) || 0;
        body.minutes = parseInt(relMinutes, 10) || 0;
      }
      const res = await fetch("/api/ringlogix/wake-up-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to schedule");
      }
      setShowModal(false);
      load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to schedule");
    } finally {
      setSaving(false);
    }
  };

  const pending = calls.filter((c) => !c.request_status || c.request_status?.toLowerCase() === "pending").length;
  const completed = calls.filter((c) => c.request_status?.toLowerCase() === "completed").length;

  return (
    <div>
      <Header
        title="Wake-Up Calls"
        subtitle="Scheduled wake-up call requests"
        actions={
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#0070f3] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#005fcc] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Schedule
          </button>
        }
      />

      {/* Domain + User filter */}
      <div className="bg-white border border-[#eaeaea] rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Domain</label>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors min-w-[180px] bg-white"
          >
            <option value="">All domains</option>
            {customers.map((c) => (
              <option key={c.domain} value={c.domain}>{c.domain}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">User / Extension</label>
          <input
            type="text"
            placeholder="e.g. 1001"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors w-36"
          />
        </div>
        <button
          onClick={load}
          disabled={state === "loading"}
          className="flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-4 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${state === "loading" ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <AlarmClock className="w-4 h-4 text-[#0070f3]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? calls.length : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Total</p>
          <p className="text-xs text-[#999]">All call requests</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <Clock className="w-4 h-4 text-[#f5a524]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? pending : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Pending</p>
          <p className="text-xs text-[#999]">Awaiting execution</p>
        </div>
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
          <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg w-fit mb-3">
            <CheckCircle className="w-4 h-4 text-[#17c964]" />
          </div>
          <p className="text-3xl font-semibold text-[#0a0a0a] leading-none mb-1">
            {state === "ok" ? completed : "-"}
          </p>
          <p className="text-sm text-[#666] mb-1">Completed</p>
          <p className="text-xs text-[#999]">Successfully delivered</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#eaeaea]">
          <p className="text-sm font-semibold text-[#0a0a0a]">Call Requests</p>
        </div>

        {state === "idle" && (
          <div className="p-12 text-center">
            <AlarmClock className="w-6 h-6 text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Loading wake-up calls…</p>
          </div>
        )}

        {state === "loading" && (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#666]">Loading wake-up calls…</p>
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

        {state === "ok" && calls.length === 0 && (
          <div className="p-12 text-center">
            <AlarmClock className="w-6 h-6 text-[#999] mx-auto mb-3" />
            <p className="text-sm text-[#999]">No wake-up calls scheduled.</p>
          </div>
        )}

        {state === "ok" && calls.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#eaeaea] bg-[#fafafa]">
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Request ID</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Type</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">User</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Destination</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Time to Call</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c, i) => {
                  const isCompleted = c.request_status?.toLowerCase() === "completed";
                  return (
                    <tr key={(c.request_id ?? "") + i} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#e8f2ff] flex items-center justify-center shrink-0">
                            <AlarmClock className="w-3.5 h-3.5 text-[#0070f3]" />
                          </div>
                          <span className="text-sm font-medium text-[#0a0a0a] font-mono">{c.request_id || "-"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {c.request ? (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#f1f1f1] text-[#666]">{c.request}</span>
                        ) : (
                          <span className="text-sm text-[#999]">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#666] font-mono">{c.orig_address || "-"}</td>
                      <td className="px-4 py-3 text-sm text-[#666] font-mono">{c.dest_address || "-"}</td>
                      <td className="px-4 py-3 text-sm text-[#666]">{c.time_to_call || "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${isCompleted ? "bg-[#e8fdf0] text-[#17c964]" : "bg-[#fff8e6] text-[#f5a524]"}`}>
                          {c.request_status || "pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => deleteCall(c)}
                          className="p-1.5 rounded-lg text-[#999] hover:text-[#f31260] hover:bg-[#fff0f3] transition-colors"
                          title="Delete call"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Schedule Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#eaeaea]">
              <p className="text-sm font-semibold text-[#0a0a0a]">Schedule Wake-Up Call</p>
              <button onClick={() => { setShowModal(false); setSaveError(""); }} className="p-1 rounded-lg hover:bg-[#f5f5f5] transition-colors text-[#999]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">UID (user@domain)</label>
                <input
                  type="text"
                  placeholder="e.g. 1001@atlantisutility.com"
                  value={uid}
                  onChange={(e) => setUid(e.target.value)}
                  className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors w-full"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setScheduleMode("specific")}
                  className={`flex-1 text-sm font-medium py-1.5 rounded-lg border transition-colors ${scheduleMode === "specific" ? "bg-[#0070f3] text-white border-[#0070f3]" : "border-[#eaeaea] text-[#666] hover:bg-[#fafafa]"}`}
                >
                  Specific Time
                </button>
                <button
                  onClick={() => setScheduleMode("relative")}
                  className={`flex-1 text-sm font-medium py-1.5 rounded-lg border transition-colors ${scheduleMode === "relative" ? "bg-[#0070f3] text-white border-[#0070f3]" : "border-[#eaeaea] text-[#666] hover:bg-[#fafafa]"}`}
                >
                  Relative
                </button>
              </div>
              {scheduleMode === "specific" && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Date & Time (GMT)</label>
                  <input
                    type="datetime-local"
                    value={specificTime}
                    onChange={(e) => setSpecificTime(e.target.value)}
                    className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors w-full"
                  />
                </div>
              )}
              {scheduleMode === "relative" && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Days</label>
                    <input type="number" min="0" value={relDays} onChange={(e) => setRelDays(e.target.value)} className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors w-full" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Hours</label>
                    <input type="number" min="0" max="23" value={relHours} onChange={(e) => setRelHours(e.target.value)} className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors w-full" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Minutes</label>
                    <input type="number" min="0" max="59" value={relMinutes} onChange={(e) => setRelMinutes(e.target.value)} className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors w-full" />
                  </div>
                </div>
              )}
              {saveError && <p className="text-xs text-[#f31260]">{saveError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#eaeaea]">
              <button onClick={() => { setShowModal(false); setSaveError(""); }} className="text-sm border border-[#eaeaea] bg-white text-[#0a0a0a] font-medium px-4 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors">Cancel</button>
              <button onClick={scheduleCall} disabled={saving} className="text-sm bg-[#0070f3] text-white font-medium px-4 py-1.5 rounded-lg hover:bg-[#005fcc] transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
