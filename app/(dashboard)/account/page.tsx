"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { updateEmployee } from "@/lib/db/employees";
import { getLogs, logActivity, type ActivityLogEntry } from "@/lib/activity-log";
import { getInitials } from "@/lib/utils";
import { Pencil, Check, Mail, Shield, Clock, Phone, MapPin, Briefcase, Building2, X, Calendar, Activity } from "lucide-react";
import Header from "@/components/layout/Header";
import FormField, { inputClass } from "@/components/ui/FormField";
import type { Employee } from "@/lib/mock-data";

// ── Admin-only extra profile (localStorage, used when no employee record) ──

interface ExtraProfile {
  phone:    string;
  altEmail: string;
  title:    string;
  location: string;
}
const EXTRA_KEY = "account_extra_profile";
function loadExtra(): ExtraProfile {
  try {
    const raw = localStorage.getItem(EXTRA_KEY);
    return raw
      ? { phone: "", altEmail: "", title: "", location: "", ...JSON.parse(raw) }
      : { phone: "", altEmail: "", title: "", location: "" };
  } catch { return { phone: "", altEmail: "", title: "", location: "" }; }
}

// ── Activity colours ────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, { bg: string; text: string }> = {
  employees: { bg: "bg-[#f5f5f5]",  text: "text-[#444]"    },
  projects:  { bg: "bg-[#f0f4ff]",  text: "text-[#3b5bdb]" },
  access:    { bg: "bg-[#fffbeb]",  text: "text-[#b45309]" },
  auth:      { bg: "bg-[#f5f5f5]",  text: "text-[#444]"    },
  settings:  { bg: "bg-[#f5f5f5]",  text: "text-[#666]"    },
  network:   { bg: "bg-[#fef2f2]",  text: "text-[#b91c1c]" },
  system:    { bg: "bg-[#f0fdf4]",  text: "text-[#15803d]" },
};

// ── Readonly badge ──────────────────────────────────────────────────────────
function ReadonlyBadge() {
  return (
    <span className="ml-1.5 text-[9px] font-medium text-[#bbb] bg-[#f5f5f5] border border-[#eaeaea] px-1.5 py-0.5 rounded-full uppercase tracking-wide">
      Admin only
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const { authUser, updateDisplayName } = useAuth();

  // Employee record (live from Firestore if linked)
  const [employee, setEmployee] = useState<Employee | null>(null);

  // Edit state
  const [editing,  setEditing]  = useState(false);
  const [name,     setName]     = useState("");
  const [phone,    setPhone]    = useState("");
  const [location, setLocation] = useState("");
  const [altEmail, setAltEmail] = useState("");

  // Admin-only extra (no employee record)
  const [extra,    setExtra]    = useState<ExtraProfile>(loadExtra);

  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState("");
  const [logs,     setLogs]     = useState<ActivityLogEntry[]>([]);

  // Subscribe to employee row — by employeeId if linked, else find by email
  useEffect(() => {
    if (!authUser) return;

    function applyRow(row: { id: string; data: Employee } | null) {
      if (!row) return;
      const data = { ...row.data, id: row.id };
      if (!data.accessRole && authUser!.isAdmin) {
        updateEmployee(row.id, { accessRole: "Administrator" } as Partial<Employee>).catch(() => {});
      }
      setEmployee(data);
    }

    if (authUser.employeeId) {
      const employeeId = authUser.employeeId;
      supabase.from("employees").select("id, data").eq("id", employeeId).maybeSingle()
        .then(({ data }) => applyRow(data));

      const channel = supabase
        .channel(`employee-${employeeId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "employees", filter: `id=eq.${employeeId}` },
          (payload) => applyRow(payload.new as { id: string; data: Employee } | null))
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }

    // Admin with no employeeId — try to find by matching email
    supabase.from("employees").select("id, data").eq("email", authUser.email).maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error("[account] employee lookup:", error); return; }
        applyRow(data);
      });
  }, [authUser?.employeeId, authUser?.email]);

  // Seed name field when auth user loads
  useEffect(() => {
    if (authUser) setName(authUser.displayName);
  }, [authUser]);

  // Activity log
  useEffect(() => {
    const all = getLogs();
    const mine = all.filter((e) =>
      authUser?.employeeId ? e.userId === authUser.employeeId : e.userId === null
    );
    setLogs(mine.slice(0, 30));
    function onEntry() {
      const updated = getLogs();
      const filtered = updated.filter((e) =>
        authUser?.employeeId ? e.userId === authUser.employeeId : e.userId === null
      );
      setLogs(filtered.slice(0, 30));
    }
    window.addEventListener("activity-log-entry", onEntry);
    return () => window.removeEventListener("activity-log-entry", onEntry);
  }, [authUser]);

  // ── Edit handlers ───────────────────────────────────────────────────────

  function handleEdit() {
    setName(authUser?.displayName ?? "");
    if (employee) {
      setPhone(employee.phone ?? "");
      setLocation(employee.location ?? "");
      setAltEmail("");
    } else {
      const e = loadExtra();
      setPhone(e.phone);
      setLocation(e.location);
      setAltEmail(e.altEmail);
    }
    setError("");
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setError("");
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name cannot be empty"); return; }
    setSaving(true);
    setError("");
    try {
      const changes: string[] = [];

      if (name.trim() !== authUser?.displayName)
        changes.push(`Name: "${authUser?.displayName}" → "${name.trim()}"`);

      await updateDisplayName(name.trim());

      if (authUser?.employeeId && employee) {
        const patch: Partial<Employee> = {};
        if (name.trim() !== employee.name)       { patch.name     = name.trim();     changes.push(`Name: "${employee.name}" → "${name.trim()}"`); }
        if (phone    !== (employee.phone    ?? "")) { patch.phone    = phone.trim();    changes.push(`Phone: "${employee.phone || "—"}" → "${phone.trim() || "—"}"`); }
        if (location !== (employee.location ?? "")) { patch.location = location.trim(); changes.push(`Location: "${employee.location || "—"}" → "${location.trim() || "—"}"`); }
        if (Object.keys(patch).length > 0) await updateEmployee(authUser.employeeId, patch);
      } else {
        const newExtra: ExtraProfile = { phone, altEmail, title: extra.title, location };
        localStorage.setItem(EXTRA_KEY, JSON.stringify(newExtra));
        setExtra(newExtra);
        if (phone    !== extra.phone)    changes.push(`Phone: "${extra.phone    || "—"}" → "${phone    || "—"}"`);
        if (altEmail !== extra.altEmail) changes.push(`Alt Email: "${extra.altEmail || "—"}" → "${altEmail || "—"}"`);
        if (location !== extra.location) changes.push(`Location: "${extra.location || "—"}" → "${location || "—"}"`);
      }

      if (changes.length > 0) {
        logActivity({ category: "settings", action: "Profile updated", detail: changes.join("; ") });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
      setEditing(false);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!authUser) return null;

  // Resolved display values (prefer live employee record)
  const displayPhone    = employee?.phone    ?? extra.phone    ?? "";
  const displayLocation = employee?.location ?? extra.location ?? "";
  const displayRole     = employee?.role     ?? "";
  const displayAccessRole = employee?.accessRole ?? (authUser.isAdmin ? "Administrator" : "Contributor");
  const displayDept     = employee?.department ?? extra.title   ?? "";
  const displayStart    = employee?.startDate ?? "";
  const displayStatus   = employee?.status   ?? "";

  const memberSince = authUser.user.created_at
    ? new Date(authUser.user.created_at).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      })
    : null;

  return (
    <div>
      <Header
        title="My Account"
        subtitle="Manage your profile and contact details"
        actions={
          !editing ? (
            <button
              onClick={handleEdit}
              className="flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit Profile
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          )
        }
      />

      {saved && (
        <div className="flex items-center gap-2 bg-[#f0fdf4] border border-[#bbf7d0] text-[#16a34a] text-sm font-medium px-4 py-3 rounded-xl mb-5">
          <Check className="w-4 h-4" />
          Profile saved successfully
        </div>
      )}
      {error && (
        <div className="bg-[#fff5f5] border border-[#fecaca] text-[#dc2626] text-sm px-4 py-3 rounded-xl mb-5">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left: profile + contact ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Identity */}
          <div className="bg-white border border-[#eaeaea] rounded-xl p-6">
            {/* Avatar row */}
            <div className="flex items-center gap-4 pb-5 border-b border-[#f5f5f5] mb-5">
              <div className="w-16 h-16 rounded-full bg-[#0a0a0a] flex items-center justify-center shrink-0">
                <span className="text-white text-xl font-semibold">{getInitials(authUser.displayName)}</span>
              </div>
              <div>
                <p className="text-xl font-semibold text-[#0a0a0a] leading-tight">{authUser.displayName}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[#0a0a0a] text-white">
                    <Shield className="w-2.5 h-2.5" />
                    {displayAccessRole}
                  </span>
                  {displayStatus && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                      displayStatus === "active"   ? "bg-[#f0fdf4] text-[#16a34a]" :
                      displayStatus === "on-leave" ? "bg-[#fffbeb] text-[#b45309]" :
                                                     "bg-[#f0f4ff] text-[#3b5bdb]"
                    }`}>{displayStatus.replace("-", " ")}</span>
                  )}
                </div>
              </div>
            </div>

            <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-4">Basic Information</p>

            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Full Name" required>
                  <input autoFocus className={inputClass} value={name}
                    onChange={(e) => { setName(e.target.value); setError(""); }}
                    placeholder="Your full name" />
                </FormField>

                {/* Role — read-only even in edit mode */}
                <div>
                  <label className="flex items-center text-[10px] text-[#999] uppercase tracking-wider mb-1.5">
                    Role <ReadonlyBadge />
                  </label>
                  <input className={`${inputClass} opacity-60 cursor-not-allowed`} value={displayRole} disabled />
                </div>

                {/* Department — read-only */}
                {employee && (
                  <div>
                    <label className="flex items-center text-[10px] text-[#999] uppercase tracking-wider mb-1.5">
                      Department <ReadonlyBadge />
                    </label>
                    <input className={`${inputClass} opacity-60 cursor-not-allowed`} value={displayDept} disabled />
                  </div>
                )}

                {/* Start Date — read-only */}
                {displayStart && (
                  <div>
                    <label className="flex items-center text-[10px] text-[#999] uppercase tracking-wider mb-1.5">
                      Start Date <ReadonlyBadge />
                    </label>
                    <input className={`${inputClass} opacity-60 cursor-not-allowed`} value={displayStart} disabled />
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { icon: <Shield    className="w-3.5 h-3.5 text-[#666]" />, label: "Full Name",  value: authUser.displayName, always: true },
                  { icon: <Briefcase className="w-3.5 h-3.5 text-[#666]" />, label: "Role",       value: displayRole,          always: true },
                  { icon: <Building2 className="w-3.5 h-3.5 text-[#666]" />, label: "Department", value: displayDept,          always: !!displayDept },
                  { icon: <Calendar  className="w-3.5 h-3.5 text-[#666]" />, label: "Start Date", value: displayStart,         always: !!displayStart },
                ].filter((r) => r.always).map((row) => (
                  <div key={row.label} className="flex items-start gap-3">
                    <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg shrink-0 mt-0.5">{row.icon}</div>
                    <div>
                      <p className="text-[10px] text-[#999] uppercase tracking-wider mb-0.5">{row.label}</p>
                      <p className="text-sm font-medium text-[#0a0a0a]">{row.value || "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contact */}
          <div className="bg-white border border-[#eaeaea] rounded-xl p-6">
            <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-4">Contact Information</p>

            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center text-[10px] text-[#999] uppercase tracking-wider mb-1.5">
                    Login Email <ReadonlyBadge />
                  </label>
                  <input className={`${inputClass} opacity-60 cursor-not-allowed`} value={authUser.email} disabled />
                </div>

                {!employee && (
                  <FormField label="Additional Email" hint="Optional">
                    <input className={inputClass} type="email" value={altEmail}
                      onChange={(e) => setAltEmail(e.target.value)} placeholder="alt@example.com" />
                  </FormField>
                )}

                <FormField label="Phone Number" hint="Optional">
                  <input className={inputClass} type="tel" value={phone}
                    onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
                </FormField>

                <FormField label="Location" hint="Optional">
                  <input className={inputClass} value={location}
                    onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Ventura, CA" />
                </FormField>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { icon: <Mail  className="w-3.5 h-3.5 text-[#666]" />, label: "Login Email",      value: authUser.email      },
                  { icon: <Mail  className="w-3.5 h-3.5 text-[#666]" />, label: "Additional Email",  value: !employee ? extra.altEmail : undefined, skip: !!employee },
                  { icon: <Phone className="w-3.5 h-3.5 text-[#666]" />, label: "Phone",            value: displayPhone        },
                  { icon: <MapPin className="w-3.5 h-3.5 text-[#666]" />, label: "Location",        value: displayLocation     },
                  { icon: <Clock  className="w-3.5 h-3.5 text-[#666]" />, label: "Member Since",    value: memberSince ?? ""   },
                ].filter((r) => !r.skip).map((row) => (
                  <div key={row.label} className="flex items-start gap-3">
                    <div className="bg-[#fafafa] border border-[#eaeaea] p-2 rounded-lg shrink-0 mt-0.5">{row.icon}</div>
                    <div>
                      <p className="text-[10px] text-[#999] uppercase tracking-wider mb-0.5">{row.label}</p>
                      <p className="text-sm font-medium text-[#0a0a0a] break-all">{row.value || "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: activity ── */}
        <div className="bg-white border border-[#eaeaea] rounded-xl p-5 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-[#999]" />
            <p className="text-sm font-semibold text-[#0a0a0a]">Recent Activity</p>
          </div>
          {logs.length === 0 ? (
            <p className="text-xs text-[#999]">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-4">
              {logs.map((entry, i) => {
                const style = CAT_COLOR[entry.category] ?? CAT_COLOR.employees;
                return (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full mt-0.5 ${style.bg} ${style.text}`}>
                      {entry.category}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#0a0a0a] leading-5">{entry.action}</p>
                      {entry.detail && (
                        <p className="text-[11px] text-[#666] leading-4 wrap-break-word">{entry.detail}</p>
                      )}
                      <p className="text-[10px] text-[#bbb] mt-0.5">
                        {new Date(entry.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

      </div>
    </div>
  );
}
