"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { subscribeEmployees } from "@/lib/db/employees";
import { getAvatarColor, getInitials, formatDate } from "@/lib/utils";
import { Search, Plus } from "lucide-react";
import type { Employee, EmployeeStatus } from "@/lib/mock-data";
import AddEmployeeDrawer from "@/components/employees/AddEmployeeDrawer";
import Select from "@/components/ui/Select";

const statusConfig: Record<EmployeeStatus, { label: string; bg: string; text: string; dot: string }> = {
  active: {
    label: "Active",
    bg: "bg-[#e8fdf0]",
    text: "text-[#17c964]",
    dot: "bg-[#17c964]",
  },
  remote: {
    label: "Remote",
    bg: "bg-[#e8f2ff]",
    text: "text-[#0070f3]",
    dot: "bg-[#0070f3]",
  },
  "on-leave": {
    label: "On Leave",
    bg: "bg-[#fff8e6]",
    text: "text-[#f5a524]",
    dot: "bg-[#f5a524]",
  },
};

const allStatuses: Array<"All Statuses" | EmployeeStatus> = [
  "All Statuses",
  "active",
  "remote",
  "on-leave",
];

export default function EmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<"All Statuses" | EmployeeStatus>(
    "All Statuses"
  );

  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:employees");
      if (c) setEmployees(JSON.parse(c));
    } catch {}
    const unsub = subscribeEmployees((emps) => {
      setEmployees(emps);
      try { localStorage.setItem("sc:employees", JSON.stringify(emps)); } catch {}
    });
    return unsub;
  }, []);

  const filtered = employees.filter((emp) => {
    const matchesSearch =
      emp.name.toLowerCase().includes(search.toLowerCase()) ||
      emp.email.toLowerCase().includes(search.toLowerCase()) ||
      emp.role.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      selectedStatus === "All Statuses" || emp.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      <Header
        title="Employees"
        subtitle={`${employees.length} team members`}
        actions={
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Employee
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
          <input
            type="text"
            placeholder="Search by name, email, or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-[#eaeaea] rounded-lg pl-9 pr-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#0070f3] transition-colors"
          />
        </div>

        <div className="w-40">
          <Select
            value={selectedStatus}
            onChange={(v) => setSelectedStatus(v as "All Statuses" | EmployeeStatus)}
            options={allStatuses.map((s) => ({
              value: s,
              label: s === "on-leave" ? "On Leave" : s.charAt(0).toUpperCase() + s.slice(1),
            }))}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl overflow-x-auto">
        <table className="w-full min-w-140">
          <thead>
            <tr className="border-b border-[#eaeaea] bg-[#fafafa]">
              <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">
                Employee
              </th>
              <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">
                Role
              </th>
              <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">
                Access
              </th>
              <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">
                Status
              </th>
              <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">
                Location
              </th>
              <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">
                Start Date
              </th>
              <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-sm text-[#999] py-12">
                  {employees.length === 0 ? "Loading employees..." : "No employees match your search."}
                </td>
              </tr>
            ) : (
              filtered.map((emp) => {
                const colors = getAvatarColor(emp.name);
                const status = statusConfig[emp.status];
                return (
                  <tr
                    key={emp.id}
                    className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] cursor-pointer transition-colors"
                    onClick={() => router.push(`/employees/${emp.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center shrink-0`}
                        >
                          <span className="text-xs font-semibold">
                            {getInitials(emp.name)}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#0a0a0a]">{emp.name}</p>
                          <p className="text-xs text-[#999]">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[#444]">{emp.role}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-[#f5f5f5] text-[#444]">
                        {emp.accessRole ?? "Contributor"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${status.bg} ${status.text}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[#666]">{emp.location}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[#666]">{formatDate(emp.startDate)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/employees/${emp.id}`);
                        }}
                        className="text-xs font-medium border border-[#eaeaea] text-[#444] px-3 py-1.5 rounded-lg hover:bg-[#f5f5f5] hover:border-[#d4d4d4] transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[#999] mt-3">
        Showing {filtered.length} of {employees.length} employees
      </p>

      <AddEmployeeDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
