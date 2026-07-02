"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { formatDate } from "@/lib/utils";
import { getAvatarColor, getInitials } from "@/lib/utils";
import { Plus, Building2, Mail, Phone } from "lucide-react";
import AddProjectDrawer, { type Project } from "@/components/projects/AddProjectDrawer";
import { statusConfig, priorityConfig } from "@/lib/mock-projects";
import { subscribeProjects } from "@/lib/db/projects";
import type { ProjectStatus } from "@/lib/mock-projects";

type Tab = "all" | ProjectStatus;
const tabs: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "on-hold", label: "On Hold" },
  { key: "overdue", label: "Overdue" },
];

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("all");

  useEffect(() => {
    // Show last-known projects instantly while Firestore responds
    try {
      const c = localStorage.getItem("sc:projects");
      if (c) setProjects(JSON.parse(c));
    } catch {}

    const unsub = subscribeProjects((ps) => {
      setProjects(ps);
      try { localStorage.setItem("sc:projects", JSON.stringify(ps)); } catch {}
    });
    return unsub;
  }, []);

  const filtered = activeTab === "all" ? projects : projects.filter((p) => p.status === activeTab);

  const counts = {
    active:    projects.filter((p) => p.status === "active").length,
    completed: projects.filter((p) => p.status === "completed").length,
    "on-hold": projects.filter((p) => p.status === "on-hold").length,
    overdue:   projects.filter((p) => p.status === "overdue").length,
  };

  return (
    <div>
      <Header
        title="Projects"
        subtitle={`${projects.length} projects`}
        actions={
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:flex md:items-stretch md:divide-x divide-[#f4f4f4] bg-white border border-[#eaeaea] rounded-xl mb-6 overflow-hidden">
        {[
          { label: "Total Projects", value: projects.length,    sub: "All time",                                                          valueColor: undefined as string | undefined, subColor: undefined as string | undefined },
          { label: "Active",         value: counts.active,      sub: "In progress",                                                       valueColor: counts.active > 0 ? "text-[#0070f3]" : undefined, subColor: undefined },
          { label: "Completed",      value: counts.completed,   sub: "Finished",                                                          valueColor: counts.completed > 0 ? "text-[#17c964]" : undefined, subColor: undefined },
          { label: "On Hold",        value: counts["on-hold"],  sub: "Paused",                                                            valueColor: undefined, subColor: undefined },
          { label: "Overdue",        value: counts.overdue,     sub: counts.overdue > 0 ? "Needs attention" : "All on track",             valueColor: counts.overdue > 0 ? "text-[#f31260]" : undefined, subColor: counts.overdue > 0 ? "text-[#f31260]" : undefined },
        ].map(({ label, value, sub, valueColor, subColor }, i, arr) => (
          <div key={label} className={`flex-1 px-5 py-5 hover:bg-[#fafafa] transition-colors ${i < arr.length - 1 ? "border-b md:border-b-0 border-[#f4f4f4]" : ""}`}>
            <p className={`text-2xl font-bold tabular-nums leading-none ${valueColor ?? "text-[#0a0a0a]"}`}>{value}</p>
            <p className="text-[11px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-[10px] mt-0.5 ${subColor ?? "text-[#bbb]"}`}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              activeTab === tab.key
                ? "bg-[#0a0a0a] text-white font-medium"
                : "text-[#666] hover:bg-[#f1f1f1]"
            }`}
          >
            {tab.label}
            {tab.key !== "all" && (
              <span className="ml-1.5 text-[10px] opacity-70">
                {counts[tab.key as ProjectStatus]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl overflow-x-auto">
        <table className="w-full min-w-200">
          <thead>
            <tr className="border-b border-[#eaeaea] bg-[#fafafa]">
              <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Project</th>
              <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Client</th>
              <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Status</th>
              <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Priority</th>
              <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Owner</th>
              <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Progress</th>
              <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Deadline</th>
              <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">Team</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-sm text-[#999] py-12">
                  {projects.length === 0 ? "Loading projects..." : "No projects in this category."}
                </td>
              </tr>
            ) : (
              filtered.map((project) => {
                const st = statusConfig[project.status];
                const pr = priorityConfig[project.priority];
                const isOverdue = !project.deadlineTbd && project.status === "overdue";
                return (
                  <tr key={project.id} onClick={() => router.push(`/projects/${project.id}`)} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors cursor-pointer">
                    <td className="px-4 py-3 max-w-50">
                      <p className="text-sm font-medium text-[#0a0a0a]">{project.name}</p>
                      <p className="text-xs text-[#999] mt-0.5 truncate">{project.description}</p>
                    </td>
                    <td className="px-4 py-3 max-w-45">
                      {project.clientName ? (
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <Building2 className="w-3 h-3 text-[#999] shrink-0" />
                            <p className="text-xs font-medium text-[#0a0a0a] truncate">{project.clientName}</p>
                          </div>
                          {/* Show first contact inline; +N badge if more */}
                          {(() => {
                            const all = project.contacts && project.contacts.length > 0
                              ? project.contacts
                              : (project.clientContact || project.clientEmail || project.clientPhone)
                                ? [{ name: project.clientContact ?? "", designation: "", email: project.clientEmail ?? "", phone: project.clientPhone ?? "" }]
                                : [];
                            if (all.length === 0) return null;
                            const first = all.find((c) => c.isMain) ?? all[0];
                            return (
                              <div className="ml-4 space-y-0.5">
                                {first.name && (
                                  <p className="text-[10px] text-[#666] truncate">{first.name}</p>
                                )}
                                {first.designation && (
                                  <p className="text-[10px] text-[#bbb] truncate">{first.designation}</p>
                                )}
                                <div className="flex items-center gap-2">
                                  {first.email && (
                                    <a
                                      href={`mailto:${first.email}`}
                                      onClick={(e) => e.stopPropagation()}
                                      title={first.email}
                                      className="text-[#0070f3] hover:text-[#0060d0] transition-colors"
                                    >
                                      <Mail className="w-3 h-3" />
                                    </a>
                                  )}
                                  {first.phone && (
                                    <a
                                      href={`tel:${first.phone}`}
                                      onClick={(e) => e.stopPropagation()}
                                      title={first.phone}
                                      className="text-[#0070f3] hover:text-[#0060d0] transition-colors"
                                    >
                                      <Phone className="w-3 h-3" />
                                    </a>
                                  )}
                                  {all.length > 1 && (
                                    <span className="text-[9px] text-[#999] bg-[#f1f1f1] px-1.5 py-0.5 rounded-full">
                                      +{all.length - 1} more
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <span className="text-xs text-[#ccc]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${st.bg} ${st.text}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-[#444]">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: pr.color }} />
                        {pr.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[#444]">{project.owner}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 w-28">
                        <div className="flex-1 bg-[#f1f1f1] rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full"
                            style={{
                              width: `${project.progress}%`,
                              backgroundColor: project.progress === 100 ? "#17c964" : "#0070f3",
                            }}
                          />
                        </div>
                        <span className="text-xs text-[#666] w-8 shrink-0">{project.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {project.deadlineTbd ? (
                        <span className="text-xs text-[#bbb] font-medium">TBD</span>
                      ) : (
                        <span className={`text-sm ${isOverdue ? "text-[#f31260] font-medium" : "text-[#666]"}`}>
                          {formatDate(project.deadline)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex -space-x-1">
                        {project.team.slice(0, 3).map((name) => {
                          const c = getAvatarColor(name);
                          return (
                            <div
                              key={name}
                              title={name}
                              className={`w-6 h-6 rounded-full ${c.bg} ${c.text} flex items-center justify-center border-2 border-white text-[9px] font-semibold`}
                            >
                              {getInitials(name)}
                            </div>
                          );
                        })}
                        {project.team.length > 3 && (
                          <div className="w-6 h-6 rounded-full bg-[#f1f1f1] text-[#666] flex items-center justify-center border-2 border-white text-[9px] font-semibold">
                            +{project.team.length - 3}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <AddProjectDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
