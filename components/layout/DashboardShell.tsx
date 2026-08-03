"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import GlobalSearch from "./GlobalSearch";
import { Menu, Bell, LogOut, User, ChevronDown } from "lucide-react";
import { getUnreadCount } from "@/lib/notifications";
import { useAuth } from "@/lib/auth-context";
import { getInitials } from "@/lib/utils";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { authUser, logout } = useAuth();

  const [collapsed, setCollapsed]       = useState(false);
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [unreadCount, setUnreadCount]   = useState(0);

  // Page-access permissions come live from auth-context (backed by a Supabase
  // realtime subscription on the employee row) — not a localStorage snapshot,
  // so changes an admin makes elsewhere take effect immediately.
  const allowedHrefs = authUser?.access;

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);

    setUnreadCount(getUnreadCount());

    function onNotif() { setUnreadCount(getUnreadCount()); }
    window.addEventListener("app-notification", onNotif as EventListener);

    return () => {
      window.removeEventListener("app-notification", onNotif as EventListener);
    };
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayName = authUser?.displayName ?? "User";
  const userEmail   = authUser?.email ?? "";

  return (
    <div className="flex h-screen overflow-hidden bg-[#fafafa]">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        allowedHrefs={allowedHrefs}
        userDisplayName={displayName}
        userInitials={getInitials(displayName)}
        userSubtext={authUser?.employeeAccessRole || (authUser?.isAdmin ? "Administrator" : "Contributor")}
      />

      <main
        className={`flex-1 flex flex-col min-h-0 overflow-hidden transition-[margin] duration-200 ease-in-out ${
          collapsed ? "md:ml-16" : "md:ml-60"
        }`}
      >
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-20 flex items-center h-14 px-4 bg-white border-b border-[#eaeaea]">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg hover:bg-[#f5f5f5] transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5 text-[#0a0a0a]" />
          </button>
          <div className="flex items-center gap-2 ml-2 flex-1">
            <div className="w-6 h-6 rounded-lg bg-[#0a0a0a] flex items-center justify-center shrink-0">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 13H2L8 2Z" fill="white" fillOpacity="0.9" />
              </svg>
            </div>
            <span className="text-[13px] font-semibold text-[#0a0a0a]">Atlantis Utility</span>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/logs?filter=notifications" className="relative p-1.5 rounded-lg hover:bg-[#f5f5f5] transition-colors" aria-label="Notifications">
              <Bell className="w-4 h-4 text-[#666]" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#0a0a0a] text-white text-[8px] font-bold flex items-center justify-center leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg hover:bg-[#f5f5f5] transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4 text-[#666]" />
            </button>
          </div>
        </div>

        {/* Desktop user bar at top (visible in desktop when sidebar is shown) */}
        <div className="hidden md:flex items-center justify-between gap-4 px-8 h-14 border-b border-[#f5f5f5]">
          <GlobalSearch allowedHrefs={allowedHrefs} />
          <div className="flex items-center gap-3 shrink-0">
          <Link href="/logs?filter=notifications" className="relative p-1.5 rounded-lg hover:bg-[#f5f5f5] transition-colors" aria-label="Notifications">
            <Bell className="w-4 h-4 text-[#666]" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#0a0a0a] text-white text-[8px] font-bold flex items-center justify-center leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
          <div className="relative pl-3 border-l border-[#f0f0f0]" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg hover:bg-[#f5f5f5] px-1.5 py-1 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-[#0a0a0a] flex items-center justify-center shrink-0">
                <span className="text-white text-[10px] font-semibold">{displayName.charAt(0).toUpperCase()}</span>
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-sm font-medium text-[#0a0a0a] leading-none">{displayName}</p>
                <p className="text-xs text-[#999] mt-0.5 leading-none">{userEmail}</p>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-[#999] transition-transform ${profileOpen ? "rotate-180" : ""}`} />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-[#eaeaea] rounded-xl shadow-lg z-50 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 border-b border-[#f5f5f5]">
                  <p className="text-xs font-semibold text-[#0a0a0a] truncate">{displayName}</p>
                  <p className="text-[10px] text-[#999] truncate mt-0.5">{userEmail}</p>
                </div>
                {/* Items */}
                <div className="py-1">
                  <Link
                    href="/account"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#0a0a0a] hover:bg-[#fafafa] transition-colors"
                  >
                    <User className="w-3.5 h-3.5 text-[#666]" />
                    View Profile
                  </Link>
                  <button
                    onClick={() => { setProfileOpen(false); handleLogout(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#dc2626] hover:bg-[#fef2f2] transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}
