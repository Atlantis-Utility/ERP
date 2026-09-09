"use client";

import { useState, useEffect } from "react";
import { getAvatarColor, getInitials } from "@/lib/utils";
import { Check, Shield, ShieldOff, Moon, Sun } from "lucide-react";
import { logActivity } from "@/lib/activity-log";
import { useAuth } from "@/lib/auth-context";
import { subscribeUserProfiles, setUserAdmin, ensureAdminProfile, type UserProfile } from "@/lib/db/user-profiles";
import { useTheme } from "@/lib/theme-context";

type Tab = "appearance" | "team";

const TABS: { key: Tab; label: string }[] = [
  { key: "appearance", label: "Appearance" },
  { key: "team",       label: "Team"       },
];

// ── Sub-components ─────────────────────────────────────────────────────────

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

function TeamTab({ onSave }: { onSave: (msg: string) => void }) {
  const { authUser } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [togglingUid, setTogglingUid] = useState<string | null>(null);

  // Ensure current user has isAdmin: true in Supabase
  useEffect(() => {
    if (authUser?.user?.id && authUser.isAdmin) {
      ensureAdminProfile(authUser.user.id, authUser.email).catch(console.error);
    }
  }, [authUser]);

  // Live listener for all user profiles
  useEffect(() => {
    const unsub = subscribeUserProfiles(setProfiles);
    return unsub;
  }, []);

  async function toggleAdmin(profile: UserProfile) {
    if (profile.uid === authUser?.user?.id) return; // can't demote yourself
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

  if (!authUser?.isAdmin) {
    return (
      <div className="bg-white border border-[#eaeaea] rounded-xl p-8 text-center">
        <p className="text-sm text-[#999]">Only admins can view and manage access.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#f4f4f4]">
        <p className="text-sm font-semibold text-[#0a0a0a]">Admin Access</p>
        <p className="text-[10px] text-[#999] mt-0.5">Manage who has admin access to this workspace. Only admins can change this.</p>
      </div>
      {profiles.length === 0 ? (
        <p className="text-sm text-[#999] text-center py-8">No users yet.</p>
      ) : (
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
              const isSelf    = profile.uid === authUser.user?.id;
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
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("appearance");
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

      {activeTab === "appearance" && <AppearanceTab onSave={showToast} />}
      {activeTab === "team"       && <TeamTab       onSave={showToast} />}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
