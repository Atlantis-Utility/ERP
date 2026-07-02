"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getLogs, type ActivityLogEntry } from "@/lib/activity-log";
import { getAvatarColor, getInitials, formatDate } from "@/lib/utils";
import { ArrowLeft, Mail, Phone, Pencil, Check } from "lucide-react";
import type { Employee, EmployeeStatus } from "@/lib/mock-data";
import { NAV_PAGES } from "@/lib/nav-pages";
import EditEmployeeDrawer from "@/components/employees/EditEmployeeDrawer";

const statusConfig: Record<EmployeeStatus, { label: string; bg: string; text: string; dot: string }> = {
  active:     { label: "Active",   bg: "bg-[#e8fdf0]", text: "text-[#17c964]", dot: "bg-[#17c964]" },
  remote:     { label: "Remote",   bg: "bg-[#e8f2ff]", text: "text-[#0070f3]", dot: "bg-[#0070f3]" },
  "on-leave": { label: "On Leave", bg: "bg-[#fff8e6]", text: "text-[#f5a524]", dot: "bg-[#f5a524]" },
};

const CATEGORY_STYLE: Record<string, { bg: string; text: string }> = {
  employees: { bg: "bg-[#f5f5f5]",   text: "text-[#444]"    },
  projects:  { bg: "bg-[#f0f4ff]",   text: "text-[#3b5bdb]" },
  access:    { bg: "bg-[#fffbeb]",   text: "text-[#b45309]" },
  auth:      { bg: "bg-[#f5f5f5]",   text: "text-[#444]"    },
  settings:  { bg: "bg-[#f5f5f5]",   text: "text-[#666]"    },
  network:   { bg: "bg-[#fef2f2]",   text: "text-[#b91c1c]" },
  system:    { bg: "bg-[#f0fdf4]",   text: "text-[#15803d]" },
};

function calculateTenure(startDate: string): string {
  const start = new Date(startDate);
  const now   = new Date();
  const diffMs = now.getTime() - start.getTime();
  const years  = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25));
  const months = Math.floor((diffMs % (1000 * 60 * 60 * 24 * 365.25)) / (1000 * 60 * 60 * 24 * 30.44));
  if (years === 0)  return `${months} month${months !== 1 ? "s" : ""}`;
  if (months === 0) return `${years} year${years !== 1 ? "s" : ""}`;
  return `${years}y ${months}m`;
}


export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();

  const [employee, setEmployee]     = useState<Employee | null>(null);
  const [notFound, setNotFound]     = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [access, setAccess]     = useState<string[]>([]);
  const [logs, setLogs]         = useState<ActivityLogEntry[]>([]);

  // Live Firestore subscription for this employee
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "employees", id), (snap) => {
      if (!snap.exists()) { setNotFound(true); return; }
      setEmployee(snap.data() as Employee);
    });
    return unsub;
  }, [id]);

  // Reload access from localStorage whenever the drawer closes (after a save)
  useEffect(() => {
    if (!employee) return;
    const stored = localStorage.getItem(`emp_access_${id}`);
    if (stored) {
      try { setAccess(JSON.parse(stored)); return; } catch {}
    }
    setAccess(employee.access ?? []);
  }, [id, employee, editOpen]);

  // Load activity log entries related to this employee
  useEffect(() => {
    function load() {
      const all = getLogs();
      const related = all.filter(
        (e) =>
          e.userId === id ||
          (e.metadata?.employeeId !== undefined && String(e.metadata.employeeId) === id)
      );
      setLogs(related.slice(0, 30));
    }
    load();
    window.addEventListener("activity-log-entry", load);
    return () => window.removeEventListener("activity-log-entry", load);
  }, [id]);

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-lg font-semibold text-[#0a0a0a] mb-2">Employee not found</p>
        <Link href="/employees" className="flex items-center gap-2 text-sm text-[#0070f3] hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to Employees
        </Link>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const colors = getAvatarColor(employee.name);
  const status = statusConfig[employee.status];
  const tenure = calculateTenure(employee.startDate);

  return (
    <div>
      <Link
        href="/employees"
        className="inline-flex items-center gap-2 text-sm text-[#666] hover:text-[#0a0a0a] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Employees
      </Link>

      {/* Profile Header */}
      <div className="bg-white border border-[#eaeaea] rounded-xl p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-5">
            <div className={`w-16 h-16 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center shrink-0`}>
              <span className="text-xl font-semibold">{getInitials(employee.name)}</span>
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-[#0a0a0a] leading-tight">{employee.name}</h1>
              <p className="text-sm text-[#666] mt-1">{employee.role}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${status.bg} ${status.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Edit Profile
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Work Information */}
          <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
            <p className="text-sm font-semibold text-[#0a0a0a] mb-4">Work Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <p className="text-xs text-[#999] uppercase tracking-wider mb-1">Job Title</p>
                <p className="text-sm font-medium text-[#0a0a0a]">{employee.role}</p>
              </div>
              <div>
                <p className="text-xs text-[#999] uppercase tracking-wider mb-1">Access Role</p>
                <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-[#f5f5f5] text-[#444]">
                  {employee.accessRole ?? "Contributor"}
                </span>
              </div>
              <div>
                <p className="text-xs text-[#999] uppercase tracking-wider mb-1">Start Date</p>
                <p className="text-sm font-medium text-[#0a0a0a]">{formatDate(employee.startDate)}</p>
              </div>
              <div>
                <p className="text-xs text-[#999] uppercase tracking-wider mb-1">Location</p>
                <p className="text-sm font-medium text-[#0a0a0a]">{employee.location}</p>
              </div>
              {employee.skills && employee.skills.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-[#999] uppercase tracking-wider mb-2">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {employee.skills.map((s) => (
                      <span key={s} className="text-xs font-medium px-2.5 py-1 bg-[#f5f5f5] text-[#444] rounded-full">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Page Access (read-only) */}
          <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-[#0a0a0a]">Page Access</p>
                <p className="text-xs text-[#999] mt-0.5">{access.length} of {NAV_PAGES.length} pages granted</p>
              </div>
              <button
                onClick={() => setEditOpen(true)}
                className="text-xs font-medium text-[#0070f3] hover:underline"
              >
                Edit
              </button>
            </div>
            {access.length === 0 ? (
              <p className="text-xs text-[#999]">No pages granted yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {NAV_PAGES.filter((p) => access.includes(p.href)).map((page) => (
                  <span
                    key={page.href}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-[#f0f7ff] text-[#0070f3]"
                  >
                    <Check className="w-3 h-3 shrink-0" />
                    {page.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Contact Information */}
          <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
            <p className="text-sm font-semibold text-[#0a0a0a] mb-4">Contact Information</p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="bg-[#fafafa] p-2 rounded-lg border border-[#eaeaea]">
                  <Mail className="w-4 h-4 text-[#666]" />
                </div>
                <div>
                  <p className="text-xs text-[#999] uppercase tracking-wider mb-0.5">Email</p>
                  <a href={`mailto:${employee.email}`} className="text-sm font-medium text-[#0070f3] hover:underline">
                    {employee.email}
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-[#fafafa] p-2 rounded-lg border border-[#eaeaea]">
                  <Phone className="w-4 h-4 text-[#666]" />
                </div>
                <div>
                  <p className="text-xs text-[#999] uppercase tracking-wider mb-0.5">Phone</p>
                  <p className="text-sm font-medium text-[#0a0a0a]">{employee.phone || "Not provided"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-1 space-y-5">
          <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
            <p className="text-sm font-semibold text-[#0a0a0a] mb-4">Quick Stats</p>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-[#999] uppercase tracking-wider mb-1">Tenure</p>
                <p className="text-sm font-semibold text-[#0a0a0a]">{tenure}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
            <p className="text-sm font-semibold text-[#0a0a0a] mb-4">Activity</p>
            {logs.length === 0 ? (
              <p className="text-xs text-[#999]">No recent activity for this employee.</p>
            ) : (
              <ul className="space-y-3">
                {logs.map((entry, i) => {
                  const style = CATEGORY_STYLE[entry.category] ?? CATEGORY_STYLE.employees;
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full mt-0.5 ${style.bg} ${style.text}`}>
                        {entry.category}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-[#0a0a0a] leading-5">{entry.action}</p>
                        {entry.detail && (
                          <p className="text-xs text-[#666] leading-4">{entry.detail}</p>
                        )}
                        <p className="text-[10px] text-[#999] mt-0.5">
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

      {/* Edit drawer */}
      <EditEmployeeDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        employee={employee}
      />

    </div>
  );
}
