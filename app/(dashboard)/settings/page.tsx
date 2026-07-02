"use client";

import { useState, useEffect } from "react";
import { getAvatarColor, getInitials } from "@/lib/utils";
import { Check, X, Plus, ChevronDown, Shield, ShieldOff, Moon, Sun, Monitor } from "lucide-react";
import { logActivity } from "@/lib/activity-log";
import { useAuth } from "@/lib/auth-context";
import { subscribeUserProfiles, setUserAdmin, ensureAdminProfile, type UserProfile } from "@/lib/db/user-profiles";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useTheme } from "@/lib/theme-context";

type Tab = "general" | "appearance" | "team" | "notifications" | "integrations";

const TABS: { key: Tab; label: string }[] = [
  { key: "general",      label: "General"      },
  { key: "appearance",   label: "Appearance"   },
  { key: "team",         label: "Team"         },
  { key: "notifications",label: "Notifications"},
  { key: "integrations", label: "Integrations" },
];

// ── Types ──────────────────────────────────────────────────────────────────

interface GeneralData {
  companyName: string;
  industry: string;
  website: string;
  founded: string;
  timezone: string;
  address: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "Administrator" | "Manager" | "Analyst" | "Contributor" | "Viewer";
  lastActive: string;
}

interface NotifPref {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

interface Integration {
  id: string;
  name: string;
  description: string;
  initial: string;
  connected: boolean;
}

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_GENERAL: GeneralData = {
  companyName: "Atlantis Inc.",
  industry:    "Software / SaaS",
  website:     "atlantis.io",
  founded:     "2019",
  timezone:    "America/New_York",
  address:     "123 Market St, San Francisco, CA 94105",
};

const DEFAULT_TEAM: TeamMember[] = [
  { id: "1", name: "Yash Harale",      email: "yash.h@atlantisutility.com",      role: "Administrator", lastActive: "Just now"    },
  { id: "2", name: "Morgan Chen",      email: "morgan.chen@atlantisutility.com", role: "Manager",       lastActive: "2 hours ago" },
  { id: "3", name: "Avery Stone",      email: "avery.stone@atlantisutility.com", role: "Analyst",       lastActive: "Yesterday"   },
  { id: "4", name: "Rowan Mitchell",   email: "rowan@atlantisutility.com",       role: "Contributor",   lastActive: "3 days ago"  },
  { id: "5", name: "Marlowe Jensen",   email: "marlowe.jensen@atlantis.io",  role: "Viewer", lastActive: "1 week ago"  },
];

const DEFAULT_NOTIFS: NotifPref[] = [
  { id: "n-1", label: "New hire notifications",       description: "Get notified when a new employee joins",     enabled: true  },
  { id: "n-2", label: "Project status changes",       description: "Updates when project milestones change",     enabled: false },
  { id: "n-3", label: "Performance review reminders", description: "Reminders before review deadlines",          enabled: true  },
  { id: "n-4", label: "Leave requests",               description: "Notify on employee leave submissions",       enabled: false },
  { id: "n-5", label: "System updates",               description: "Platform maintenance and feature releases",  enabled: true  },
  { id: "n-6", label: "Network alerts",               description: "UniFi site offline or critical alerts",      enabled: true  },
  { id: "n-7", label: "Call volume spikes",           description: "RingLogix unusual call volume detected",     enabled: false },
];

const DEFAULT_INTEGRATIONS: Integration[] = [
  { id: "slack",   name: "Slack",             description: "Team messaging and notifications",    initial: "S", connected: true  },
  { id: "google",  name: "Google Workspace",  description: "Calendar, Drive, and Gmail sync",     initial: "G", connected: true  },
  { id: "github",  name: "GitHub",            description: "Repository and project activity",     initial: "G", connected: false },
  { id: "sf",      name: "Salesforce",        description: "CRM data and pipeline sync",          initial: "S", connected: true  },
  { id: "qb",      name: "QuickBooks",        description: "Accounting and financial data",       initial: "Q", connected: false },
  { id: "zapier",  name: "Zapier",            description: "Workflow automation",                 initial: "Z", connected: false },
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Australia/Sydney",
];

// ── Utility ────────────────────────────────────────────────────────────────

function ls<T>(key: string, def: T): T {
  if (typeof window === "undefined") return def;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : def;
  } catch { return def; }
}

function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      data-toggle
      onClick={onToggle}
      className={`w-10 h-6 rounded-full flex items-center px-1 transition-colors focus:outline-none ${enabled ? "bg-[#0a0a0a]" : "bg-[#e0e0e0]"}`}
      aria-checked={enabled}
      role="switch"
    >
      {/* bg-[#fff] instead of bg-white so the global dark override doesn't darken the thumb */}
      <div className={`w-4 h-4 rounded-full bg-[#fff] shadow-sm transition-transform duration-150 ${enabled ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed top-5 right-5 flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg z-50 animate-fade-in">
      <Check className="w-4 h-4 text-[#4ade80]" />
      {message}
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────

function AppearanceTab({ onSave }: { onSave: (msg: string) => void }) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  function setThemeMode(mode: "light" | "dark") {
    if (!mounted) return;
    if (mode === theme) return;
    toggleTheme();
    onSave(`Switched to ${mode} mode`);
    logActivity({
      category: "settings",
      action: "Theme changed",
      detail: `Switched to ${mode} mode`,
      metadata: { theme: mode },
    });
  }

  if (!mounted) return null;

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#eaeaea] rounded-xl p-6">
        <p className="text-sm font-semibold text-[#0a0a0a] mb-1">Theme</p>
        <p className="text-xs text-[#999] mb-5">Choose how Atlantis Utility looks for you.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-sm">
          {/* Light */}
          <button
            onClick={() => setThemeMode("light")}
            className={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
              theme === "light"
                ? "border-[#0a0a0a] bg-[#fafafa]"
                : "border-[#eaeaea] hover:border-[#d4d4d4] bg-white"
            }`}
          >
            <div className="w-full h-16 rounded-lg bg-white border border-[#eaeaea] flex items-center justify-center shadow-sm">
              <Sun className="w-5 h-5 text-[#888]" />
            </div>
            <span className="text-xs font-medium text-[#0a0a0a]">Light</span>
            {theme === "light" && (
              <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#0a0a0a] flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" />
              </span>
            )}
          </button>

          {/* Dark */}
          <button
            onClick={() => setThemeMode("dark")}
            className={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
              theme === "dark"
                ? "border-[#0a0a0a] bg-[#fafafa]"
                : "border-[#eaeaea] hover:border-[#d4d4d4] bg-white"
            }`}
          >
            <div className="w-full h-16 rounded-lg bg-[#1a1a1a] border border-[#333] flex items-center justify-center">
              <Moon className="w-5 h-5 text-[#888]" />
            </div>
            <span className="text-xs font-medium text-[#0a0a0a]">Dark</span>
            {theme === "dark" && (
              <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#0a0a0a] flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" />
              </span>
            )}
          </button>
        </div>

        {/* Quick toggle */}
        <div className="mt-6 pt-5 border-t border-[#f4f4f4] flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#0a0a0a]">Dark mode</p>
            <p className="text-xs text-[#999] mt-0.5">Toggle between light and dark appearance</p>
          </div>
          <button
            data-toggle
            onClick={() => { toggleTheme(); onSave(theme === "light" ? "Dark mode on" : "Light mode on"); }}
            className={`w-10 h-6 rounded-full flex items-center px-1 transition-colors focus:outline-none ${
              theme === "dark" ? "bg-[#0a0a0a]" : "bg-[#e0e0e0]"
            }`}
            aria-checked={theme === "dark"}
            role="switch"
          >
            <div className={`w-4 h-4 rounded-full bg-[#fff] shadow-sm transition-transform duration-150 ${
              theme === "dark" ? "translate-x-4" : "translate-x-0"
            }`} />
          </button>
        </div>
      </div>
    </div>
  );
}

function GeneralTab({ onSave }: { onSave: (msg: string) => void }) {
  const [form, setForm] = useState<GeneralData>(() => ls("settings_general", DEFAULT_GENERAL));
  const [baseline, setBaseline] = useState<GeneralData>(() => ls("settings_general", DEFAULT_GENERAL));
  const [saved, setSaved] = useState(false);

  const isDirty = JSON.stringify(form) !== JSON.stringify(baseline);

  function set(key: keyof GeneralData, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function save() {
    const LABELS: Record<keyof GeneralData, string> = {
      companyName: "Company Name",
      industry:    "Industry",
      website:     "Website",
      founded:     "Founded",
      timezone:    "Timezone",
      address:     "Address",
    };
    const changes = (Object.keys(form) as (keyof GeneralData)[])
      .filter((k) => form[k] !== baseline[k])
      .map((k) => `${LABELS[k]}: "${baseline[k] || "—"}" → "${form[k] || "—"}"`)
      .join("; ");

    lsSet("settings_general", form);
    setBaseline(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
    onSave("Settings saved");
    logActivity({
      category: "settings",
      action: "General settings updated",
      detail: changes || `Saved settings for "${form.companyName}"`,
      metadata: { companyName: form.companyName, timezone: form.timezone },
    });
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#eaeaea] rounded-xl p-6">
        <p className="text-sm font-semibold text-[#0a0a0a] mb-5">Organization Information</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(
            [
              { key: "companyName", label: "Company Name" },
              { key: "industry",    label: "Industry"     },
              { key: "website",     label: "Website"      },
              { key: "founded",     label: "Founded"      },
            ] as { key: keyof GeneralData; label: string }[]
          ).map(({ key, label }) => (
            <div key={key}>
              <label className="block text-[10px] text-[#999] uppercase tracking-wider mb-1.5">{label}</label>
              <input
                type="text"
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                className="w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#999] transition-colors"
              />
            </div>
          ))}

          <div>
            <label className="block text-[10px] text-[#999] uppercase tracking-wider mb-1.5">Timezone</label>
            <div className="relative">
              <select
                value={form.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                className="w-full appearance-none border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#999] transition-colors bg-white"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#bbb] pointer-events-none" />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[10px] text-[#999] uppercase tracking-wider mb-1.5">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              className="w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#999] transition-colors"
            />
          </div>
        </div>
        {(isDirty || saved) && (
          <div className="flex justify-end mt-5">
            <button
              onClick={save}
              disabled={saved}
              className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                saved
                  ? "bg-[#16a34a] text-white cursor-default"
                  : "bg-[#0a0a0a] text-white hover:bg-[#333]"
              }`}
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4" />
                  Saved
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-[#eaeaea] rounded-xl p-6">
        <p className="text-sm font-semibold text-[#0a0a0a] mb-1">Danger Zone</p>
        <p className="text-xs text-[#999] mb-4">Irreversible actions that affect your entire organization.</p>
        <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-t border-[#f4f4f4]">
          <div>
            <p className="text-sm font-medium text-[#0a0a0a]">Delete Organization</p>
            <p className="text-xs text-[#999] mt-0.5">Permanently delete all data. This cannot be undone.</p>
          </div>
          <div className="relative group">
            <button
              disabled
              className="border border-[#eaeaea] text-[#ccc] text-sm font-medium px-4 py-2 rounded-lg cursor-not-allowed select-none"
            >
              Delete Organization
            </button>
            <div className="absolute right-0 bottom-full mb-2 w-64 bg-[#0a0a0a] text-white text-xs rounded-lg px-3 py-2.5 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 leading-relaxed">
              To delete the organization, contact the technical team at{" "}
              <a className="underline text-[#93c5fd] pointer-events-auto" href="mailto:yash.h@atlantisutility.com">
                yash.h@atlantisutility.com
              </a>
              <div className="absolute right-6 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#0a0a0a]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamTab({ onSave }: { onSave: (msg: string) => void }) {
  const { authUser } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>(() => ls("settings_team", DEFAULT_TEAM));
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "", role: "Contributor" as TeamMember["role"] });
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [togglingUid, setTogglingUid] = useState<string | null>(null);

  // Ensure current user has isAdmin: true in Firestore
  useEffect(() => {
    if (authUser?.firebaseUser?.uid && authUser.isAdmin) {
      ensureAdminProfile(authUser.firebaseUser.uid, authUser.email).catch(console.error);
    }
  }, [authUser]);

  // Live listener for all user profiles
  useEffect(() => {
    const unsub = subscribeUserProfiles(setProfiles);
    return unsub;
  }, []);

  async function toggleAdmin(profile: UserProfile) {
    if (profile.uid === authUser?.firebaseUser?.uid) return; // can't demote yourself
    setTogglingUid(profile.uid);
    try {
      await setUserAdmin(profile.uid, !profile.isAdmin);
      onSave(profile.isAdmin ? "Admin access revoked" : "Admin access granted");
      logActivity({
        category: "access",
        action: profile.isAdmin ? "Admin access revoked" : "Admin access granted",
        detail: `${profile.isAdmin ? "Removed" : "Granted"} admin access for ${profile.email}`,
        metadata: { uid: profile.uid, email: profile.email },
      });
    } catch {
      onSave("Failed to update access. Try again.");
    } finally {
      setTogglingUid(null);
    }
  }

  function save(next: TeamMember[]) {
    setMembers(next);
    lsSet("settings_team", next);
  }

  function addMember() {
    if (!invite.name.trim() || !invite.email.trim()) return;
    const next: TeamMember = {
      id: `m-${Date.now()}`,
      name: invite.name.trim(),
      email: invite.email.trim(),
      role: invite.role,
      lastActive: "Just invited",
    };
    save([...members, next]);
    setInvite({ name: "", email: "", role: "Contributor" });
    setInviteOpen(false);
    onSave("Invitation sent");
    logActivity({
      category: "settings",
      action: "Team member invited",
      detail: `Invited ${invite.name.trim()} (${invite.email.trim()}) as ${invite.role}`,
      metadata: { email: invite.email.trim(), role: invite.role },
    });
  }

  function changeRole(id: string, role: TeamMember["role"]) {
    const member = members.find((m) => m.id === id);
    save(members.map((m) => (m.id === id ? { ...m, role } : m)));
    onSave("Role updated");
    if (member) {
      logActivity({
        category: "settings",
        action: "Member role changed",
        detail: `Changed ${member.name}'s role from ${member.role} to ${role}`,
        metadata: { memberId: id, from: member.role, to: role },
      });
    }
  }

  function removeMember(id: string) {
    const member = members.find((m) => m.id === id);
    save(members.filter((m) => m.id !== id));
    setRemoveId(null);
    onSave("Member removed");
    if (member) {
      logActivity({
        category: "settings",
        action: "Team member removed",
        detail: `Removed ${member.name} (${member.email}) from the team`,
        metadata: { memberId: id, name: member.name, role: member.role },
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f4f4f4]">
          <div>
            <p className="text-sm font-semibold text-[#0a0a0a]">Team Members</p>
            <p className="text-[10px] text-[#999] mt-0.5">{members.length} members</p>
          </div>
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-[#0a0a0a] px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Invite Member
          </button>
        </div>

        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="border-b border-[#f4f4f4] bg-[#fafafa]">
              {["Member", "Role", "Last Active", ""].map((h) => (
                <th key={h} className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const colors = getAvatarColor(member.name);
              const isSelf = member.id === "1";
              return (
                <tr key={member.id} className="border-b border-[#f8f8f8] last:border-0 hover:bg-[#fafafa] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center shrink-0`}>
                        <span className="text-xs font-semibold">{getInitials(member.name)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#0a0a0a]">{member.name}</p>
                        <p className="text-[11px] text-[#999]">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {isSelf ? (
                      <span className="inline-flex items-center rounded-full bg-[#f1f1f1] text-[#0a0a0a] px-2.5 py-1 text-xs font-medium">
                        Admin
                      </span>
                    ) : (
                      <div className="relative inline-block">
                        <select
                          value={member.role}
                          onChange={(e) => changeRole(member.id, e.target.value as TeamMember["role"])}
                          className="appearance-none border border-[#eaeaea] rounded-lg pl-2.5 pr-6 py-1 text-xs font-medium text-[#0a0a0a] bg-white focus:outline-none focus:border-[#999] transition-colors cursor-pointer"
                        >
                          <option value="Administrator">Administrator</option>
                          <option value="Manager">Manager</option>
                          <option value="Analyst">Analyst</option>
                          <option value="Contributor">Contributor</option>
                          <option value="Viewer">Viewer</option>
                        </select>
                        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#bbb] pointer-events-none" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#666]">{member.lastActive}</td>
                  <td className="px-4 py-3">
                    {!isSelf && (
                      <button
                        onClick={() => setRemoveId(member.id)}
                        className="text-xs font-medium text-[#999] hover:text-[#dc2626] transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setInviteOpen(false)}>
          <div className="bg-white rounded-2xl border border-[#eaeaea] shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-semibold text-[#0a0a0a]">Invite Team Member</p>
              <button onClick={() => setInviteOpen(false)} className="p-1.5 rounded-lg hover:bg-[#f5f5f5] transition-colors text-[#999]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] text-[#999] uppercase tracking-wider mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={invite.name}
                  onChange={(e) => setInvite((i) => ({ ...i, name: e.target.value }))}
                  placeholder="Jane Smith"
                  className="w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#999] transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[#999] uppercase tracking-wider mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={invite.email}
                  onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
                  placeholder="jane@company.com"
                  className="w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#999] transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[#999] uppercase tracking-wider mb-1.5">Role</label>
                <div className="relative">
                  <select
                    value={invite.role}
                    onChange={(e) => setInvite((i) => ({ ...i, role: e.target.value as TeamMember["role"] }))}
                    className="w-full appearance-none border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:outline-none focus:border-[#999] transition-colors"
                  >
                    <option value="Administrator">Administrator — Full access</option>
                    <option value="Manager">Manager — Manage teams &amp; projects</option>
                    <option value="Analyst">Analyst — View &amp; export data</option>
                    <option value="Contributor">Contributor — Add &amp; edit content</option>
                    <option value="Viewer">Viewer — Read only</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#bbb] pointer-events-none" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setInviteOpen(false)}
                className="border border-[#eaeaea] text-sm font-medium text-[#666] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addMember}
                disabled={!invite.name.trim() || !invite.email.trim()}
                className="bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!removeId}
        title="Remove team member?"
        description={`${members.find((m) => m.id === removeId)?.name ?? "This member"} will be removed from the workspace. They will lose access immediately.`}
        confirmLabel="Remove Member"
        onConfirm={() => { if (removeId) removeMember(removeId); }}
        onCancel={() => setRemoveId(null)}
      />

      {/* Admin Access Management */}
      {authUser?.isAdmin && profiles.length > 0 && (
        <div className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#f4f4f4]">
            <p className="text-sm font-semibold text-[#0a0a0a]">Admin Access</p>
            <p className="text-[10px] text-[#999] mt-0.5">Manage who has admin access to this workspace. Only admins can change this.</p>
          </div>
          <table className="w-full min-w-130">
            <thead>
              <tr className="border-b border-[#f4f4f4] bg-[#fafafa]">
                {["User", "Email", "Admin Access", ""].map((h) => (
                  <th key={h} className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => {
                const isSelf    = profile.uid === authUser.firebaseUser?.uid;
                const colors    = getAvatarColor(profile.email);
                const initials  = getInitials(profile.displayName || profile.email.split("@")[0]);
                const toggling  = togglingUid === profile.uid;
                return (
                  <tr key={profile.uid} className="border-b border-[#f8f8f8] last:border-0 hover:bg-[#fafafa] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full ${isSelf ? "bg-[#0a0a0a]" : colors.bg} ${isSelf ? "text-white" : colors.text} flex items-center justify-center shrink-0`}>
                          <span className="text-xs font-semibold">{initials}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#0a0a0a]">
                            {profile.displayName || profile.email.split("@")[0]}
                            {isSelf && <span className="ml-1.5 text-[10px] text-[#999]">(you)</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666]">{profile.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                        profile.isAdmin
                          ? "bg-[#0a0a0a] text-white"
                          : "bg-[#f5f5f5] text-[#666]"
                      }`}>
                        <Shield className="w-3 h-3" />
                        {profile.isAdmin ? "Admin" : "No access"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isSelf ? (
                        <span className="text-xs text-[#ccc]">Cannot change own access</span>
                      ) : (
                        <button
                          onClick={() => toggleAdmin(profile)}
                          disabled={toggling}
                          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                            profile.isAdmin
                              ? "border-[#fecaca] text-[#dc2626] hover:bg-[#fef2f2]"
                              : "border-[#eaeaea] text-[#0a0a0a] hover:bg-[#f5f5f5]"
                          }`}
                        >
                          {toggling ? (
                            "Updating…"
                          ) : profile.isAdmin ? (
                            <><ShieldOff className="w-3 h-3" /> Revoke Admin</>
                          ) : (
                            <><Shield className="w-3 h-3" /> Grant Admin</>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NotificationsTab({ onSave }: { onSave: (msg: string) => void }) {
  const [notifs, setNotifs] = useState<NotifPref[]>(() => ls("settings_notifs", DEFAULT_NOTIFS));

  function toggle(id: string) {
    const notif = notifs.find((n) => n.id === id);
    const next = notifs.map((n) => (n.id === id ? { ...n, enabled: !n.enabled } : n));
    setNotifs(next);
    lsSet("settings_notifs", next);
    onSave("Preference updated");
    if (notif) {
      logActivity({
        category: "settings",
        action: `Notification ${notif.enabled ? "disabled" : "enabled"}`,
        detail: `${notif.enabled ? "Disabled" : "Enabled"} notification: "${notif.label}"`,
        metadata: { prefId: id, enabled: !notif.enabled },
      });
    }
  }

  function toggleAll(enabled: boolean) {
    const next = notifs.map((n) => ({ ...n, enabled }));
    setNotifs(next);
    lsSet("settings_notifs", next);
    onSave(enabled ? "All notifications enabled" : "All notifications disabled");
    logActivity({
      category: "settings",
      action: enabled ? "All notifications enabled" : "All notifications disabled",
      detail: `Bulk ${enabled ? "enabled" : "disabled"} all ${notifs.length} notification preferences`,
    });
  }

  const allOn = notifs.every((n) => n.enabled);

  return (
    <div className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#f4f4f4]">
        <div>
          <p className="text-sm font-semibold text-[#0a0a0a]">Notification Preferences</p>
          <p className="text-[10px] text-[#999] mt-0.5">{notifs.filter((n) => n.enabled).length} of {notifs.length} enabled</p>
        </div>
        <button
          onClick={() => toggleAll(!allOn)}
          className="text-xs font-medium text-[#666] border border-[#eaeaea] px-3 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
        >
          {allOn ? "Disable all" : "Enable all"}
        </button>
      </div>
      <div className="divide-y divide-[#f8f8f8]">
        {notifs.map((n) => (
          <div key={n.id} className="flex items-center justify-between px-5 py-4 hover:bg-[#fafafa] transition-colors">
            <div className="flex-1 min-w-0 mr-4">
              <p className="text-sm font-medium text-[#0a0a0a]">{n.label}</p>
              <p className="text-xs text-[#999] mt-0.5">{n.description}</p>
            </div>
            <Toggle enabled={n.enabled} onToggle={() => toggle(n.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function IntegrationsTab({ onSave }: { onSave: (msg: string) => void }) {
  const [integrations, setIntegrations] = useState<Integration[]>(() => ls("settings_integrations", DEFAULT_INTEGRATIONS));
  const [disconnectId, setDisconnectId] = useState<string | null>(null);

  function connect(id: string) {
    const intg = integrations.find((i) => i.id === id);
    const next = integrations.map((i) => (i.id === id ? { ...i, connected: true } : i));
    setIntegrations(next);
    lsSet("settings_integrations", next);
    onSave("Integration connected");
    if (intg) {
      logActivity({
        category: "settings",
        action: "Integration connected",
        detail: `Connected ${intg.name} integration`,
        metadata: { integrationId: id, name: intg.name },
      });
    }
  }

  function disconnect(id: string) {
    const intg = integrations.find((i) => i.id === id);
    const next = integrations.map((i) => (i.id === id ? { ...i, connected: false } : i));
    setIntegrations(next);
    lsSet("settings_integrations", next);
    setDisconnectId(null);
    onSave("Integration disconnected");
    if (intg) {
      logActivity({
        category: "settings",
        action: "Integration disconnected",
        detail: `Disconnected ${intg.name} integration`,
        metadata: { integrationId: id, name: intg.name },
      });
    }
  }

  const connected = integrations.filter((i) => i.connected);
  const available = integrations.filter((i) => !i.connected);

  return (
    <div className="space-y-5">
      {connected.length > 0 && (
        <div className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#f4f4f4]">
            <p className="text-sm font-semibold text-[#0a0a0a]">Connected</p>
            <p className="text-[10px] text-[#999] mt-0.5">{connected.length} active integration{connected.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="divide-y divide-[#f8f8f8]">
            {connected.map((intg) => (
              <div key={intg.id} className="flex items-center justify-between px-5 py-4 hover:bg-[#fafafa] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#0a0a0a] flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {intg.initial}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#0a0a0a]">{intg.name}</p>
                    <p className="text-xs text-[#999]">{intg.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-[#16a34a] bg-[#f0fdf4] border border-[#bbf7d0] px-2 py-0.5 rounded-full">
                    <Check className="w-2.5 h-2.5" /> Active
                  </span>
                  {disconnectId === intg.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => disconnect(intg.id)}
                        className="text-xs font-medium text-[#dc2626] border border-[#fecaca] px-2.5 py-1 rounded-lg hover:bg-[#fef2f2] transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDisconnectId(null)}
                        className="text-xs font-medium text-[#666] hover:text-[#0a0a0a] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDisconnectId(intg.id)}
                      className="text-xs font-medium text-[#666] border border-[#eaeaea] px-3 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {available.length > 0 && (
        <div className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#f4f4f4]">
            <p className="text-sm font-semibold text-[#0a0a0a]">Available</p>
            <p className="text-[10px] text-[#999] mt-0.5">{available.length} integration{available.length !== 1 ? "s" : ""} available</p>
          </div>
          <div className="divide-y divide-[#f8f8f8]">
            {available.map((intg) => (
              <div key={intg.id} className="flex items-center justify-between px-5 py-4 hover:bg-[#fafafa] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#f5f5f5] border border-[#eaeaea] flex items-center justify-center text-[#666] text-sm font-bold shrink-0">
                    {intg.initial}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#0a0a0a]">{intg.name}</p>
                    <p className="text-xs text-[#999]">{intg.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => connect(intg.id)}
                  className="text-xs font-medium text-white bg-[#0a0a0a] px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors shrink-0"
                >
                  Connect
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0a0a0a] leading-tight">Settings</h1>
          <p className="text-sm text-[#999] mt-1">Manage your organization preferences</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#eaeaea] mb-6 flex gap-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? "border-[#0a0a0a] text-[#0a0a0a]"
                : "border-transparent text-[#666] hover:text-[#0a0a0a]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "general"       && <GeneralTab       onSave={showToast} />}
      {activeTab === "appearance"    && <AppearanceTab    onSave={showToast} />}
      {activeTab === "team"          && <TeamTab          onSave={showToast} />}
      {activeTab === "notifications" && <NotificationsTab onSave={showToast} />}
      {activeTab === "integrations"  && <IntegrationsTab  onSave={showToast} />}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
