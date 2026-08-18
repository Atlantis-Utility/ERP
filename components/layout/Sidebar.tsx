"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getUnreadCountByPrefId, TICKET_NOTIF_PREF_ID } from "@/lib/notifications";
import {
  LayoutDashboard,
  Building2,
  TicketCheck,
  Phone,
  PhoneCall,
  KanbanSquare,
  Settings2,
  Wifi,
  AlertTriangle,
  Users,
  FolderKanban,
  FileBarChart,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  X,
  DollarSign,
  UserCircle,
  Laptop,
  Headphones,
  Video,
  Mic,
  BookUser,
  Building,
  AlarmClock,
  GitBranch,
  Cpu,
  KeyRound,
  Zap,
  CalendarDays,
  StickyNote,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  allowedHrefs?: string[]; // undefined = admin, show all
  userDisplayName?: string;
  userInitials?: string;
  userSubtext?: string;
}

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: "",
    items: [
      { label: "Dashboard", href: "/",          icon: LayoutDashboard },
      { label: "Customers", href: "/customers", icon: Building2       },
      { label: "Tickets",      href: "/tickets",      icon: TicketCheck },
      { label: "Quick Access", href: "/quick-access", icon: Zap        },
    ],
  },
  // RingLogix section: temporarily disabled
  // {
  //   label: "RingLogix",
  //   items: [
  //     { label: "Subscribers",   href: "/subscribers",   icon: UserCircle  },
  //     { label: "Phone Numbers", href: "/phone-numbers", icon: Phone       },
  //     { label: "Call Records",  href: "/call-records",  icon: PhoneCall   },
  //     { label: "Recordings",    href: "/recordings",    icon: Mic         },
  //     { label: "Devices",       href: "/devices",       icon: Laptop      },
  //     { label: "Queues",        href: "/queues",        icon: Headphones  },
  //     { label: "Conferences",   href: "/conferences",   icon: Video       },
  //     { label: "Billing",       href: "/billing",       icon: DollarSign  },
  //     { label: "Contacts",      href: "/contacts",      icon: BookUser   },
  //     { label: "Departments",   href: "/departments",   icon: Building   },
  //     { label: "Wake-Up Calls", href: "/wake-up-calls", icon: AlarmClock },
  //     { label: "Dial Rules",    href: "/dial-rules",    icon: GitBranch  },
  //     { label: "Device Models", href: "/device-models", icon: Cpu        },
  //   ],
  // },
  {
    label: "UniFi",
    items: [
      { label: "Sites",  href: "/sites",  icon: Wifi },
      { label: "Alerts", href: "/alerts", icon: AlertTriangle },
    ],
  },
  {
    label: "GDMS",
    items: [
      { label: "Devices", href: "/gdms", icon: Cpu },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Tasks",    href: "/tasks",    icon: KanbanSquare },
      { label: "Notes",    href: "/notes",    icon: StickyNote   },
      { label: "Calendar", href: "/calendar", icon: CalendarDays },
      { label: "Projects", href: "/projects", icon: FolderKanban },
      { label: "Reports",  href: "/reports",  icon: FileBarChart },
      { label: "Logs",     href: "/logs",     icon: ScrollText   },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Employees", href: "/employees", icon: Users },
    ],
  },
  {
    label: "Security",
    items: [
      { label: "Vault", href: "/vault", icon: KeyRound },
    ],
  },
];

export default function Sidebar({ collapsed, onToggle, mobileOpen = false, onMobileClose, allowedHrefs, userDisplayName = "Yash Harale", userInitials = "YH", userSubtext = "Admin" }: SidebarProps) {
  const pathname = usePathname();
  const [unseenTickets, setUnseenTickets] = useState(0);

  useEffect(() => {
    setUnseenTickets(getUnreadCountByPrefId(TICKET_NOTIF_PREF_ID));
    function onNotif() { setUnseenTickets(getUnreadCountByPrefId(TICKET_NOTIF_PREF_ID)); }
    window.addEventListener("app-notification", onNotif as EventListener);
    return () => window.removeEventListener("app-notification", onNotif as EventListener);
  }, []);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !allowedHrefs || allowedHrefs.includes(item.href)
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    /*
     * Outer div — owns width + transform transitions.
     * Desktop: always visible, width varies by collapsed state.
     * Mobile: slides in as a drawer (translate-x-0 / -translate-x-full).
     * No overflow-hidden — toggle button at -right-3 must not be clipped.
     */
    <div
      className={[
        "fixed top-0 left-0 h-full z-40 w-60 transition-[width,transform] duration-200 ease-in-out",
        collapsed ? "md:w-16" : "md:w-60",
        "md:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
      ].join(" ")}
    >
      {/* Desktop collapse toggle — hidden on mobile */}
      <button
        onClick={onToggle}
        className="hidden md:flex absolute -right-3 top-5 w-6 h-6 rounded-full bg-white border border-[#d4d4d4] items-center justify-center shadow-md hover:shadow-lg hover:border-[#aaa] transition-all z-50"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed
          ? <ChevronRight className="w-3 h-3 text-[#444]" />
          : <ChevronLeft  className="w-3 h-3 text-[#444]" />
        }
      </button>

      {/* Inner aside — overflow-hidden clips labels during desktop collapse animation */}
      <aside className="h-full w-full bg-white border-r border-[#eaeaea] flex flex-col overflow-hidden">

        {/* Logo row */}
        <div className="h-14 flex items-center border-b border-[#eaeaea] shrink-0 px-4">
          {collapsed ? (
            <div className="mx-auto w-7 h-7 rounded-lg bg-[#0a0a0a] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 13H2L8 2Z" fill="white" fillOpacity="0.9" />
              </svg>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#0a0a0a] flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2L14 13H2L8 2Z" fill="white" fillOpacity="0.9" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-[#0a0a0a] leading-none whitespace-nowrap">Atlantis Utility</p>
              </div>
              {/* Mobile close button */}
              <button
                onClick={onMobileClose}
                className="md:hidden p-1.5 rounded-lg hover:bg-[#f5f5f5] transition-colors text-[#888]"
                aria-label="Close navigation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-1">
          {visibleSections.map((section, i) => (
            <div key={section.label || i} className={collapsed ? "py-1" : "py-1 px-2"}>
              {!collapsed ? (
                section.label ? (
                  <p className="text-[10px] font-semibold text-[#bbb] uppercase tracking-widest px-2 mb-1.5 mt-2 first:mt-0">
                    {section.label}
                  </p>
                ) : (
                  <div className="mb-1.5" />
                )
              ) : (
                i > 0 && <div className="h-px bg-[#f0f0f0] mx-3 mb-1 mt-2" />
              )}

              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onMobileClose}
                        title={collapsed ? item.label : undefined}
                        className={`group relative flex items-center rounded-lg transition-colors ${
                          collapsed
                            ? "w-10 h-9 mx-auto justify-center"
                            : "gap-2.5 px-2.5 py-2 w-full"
                        } ${
                          active
                            ? "bg-[#f0f0f0] text-[#0a0a0a]"
                            : "text-[#888] hover:bg-[#f5f5f5] hover:text-[#0a0a0a]"
                        }`}
                      >
                        <item.icon className={`shrink-0 ${collapsed ? "w-4 h-4" : "w-4 h-4"}`} />

                        {!collapsed && (
                          <span className="text-sm font-medium leading-none whitespace-nowrap flex-1">
                            {item.label}
                          </span>
                        )}

                        {!collapsed && item.href === "/tickets" && unseenTickets > 0 && (
                          <span className="ml-auto flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#dc2626] text-white text-[10px] font-bold leading-none">
                            {unseenTickets > 99 ? "99+" : unseenTickets}
                          </span>
                        )}

                        {collapsed && item.href === "/tickets" && unseenTickets > 0 && (
                          <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-[#dc2626] ring-2 ring-white" />
                        )}

                        {collapsed && (
                          <span className="pointer-events-none absolute left-full ml-3 px-2 py-1.5 bg-[#111] text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-lg">
                            {item.label}
                          </span>
                        )}

                        {collapsed && active && (
                          <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-[#0a0a0a]" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Bottom: settings + user */}
        <div className={`border-t border-[#eaeaea] py-3 shrink-0 ${collapsed ? "" : "px-2"}`}>
          <Link
            href="/settings"
            onClick={onMobileClose}
            title={collapsed ? "Settings" : undefined}
            className={`group relative flex items-center rounded-lg transition-colors ${
              collapsed
                ? "w-10 h-9 mx-auto justify-center"
                : "gap-2.5 px-2.5 py-2 w-full"
            } ${
              isActive("/settings")
                ? "bg-[#f0f0f0] text-[#0a0a0a]"
                : "text-[#888] hover:bg-[#f5f5f5] hover:text-[#0a0a0a]"
            }`}
          >
            <Settings2 className="w-4 h-4 shrink-0" />
            {!collapsed && (
              <span className="text-sm font-medium whitespace-nowrap">Settings</span>
            )}
            {collapsed && (
              <span className="pointer-events-none absolute left-full ml-3 px-2 py-1.5 bg-[#111] text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-lg">
                Settings
              </span>
            )}
          </Link>

          <Link
            href="/account"
            onClick={onMobileClose}
            title={collapsed ? "My Profile" : undefined}
            className={`group flex items-center gap-2.5 mt-1 rounded-lg transition-colors hover:bg-[#f5f5f5] ${collapsed ? "justify-center py-2 w-10 h-9 mx-auto" : "px-2.5 py-2 w-full"}`}
          >
            <div className="w-7 h-7 rounded-full bg-[#0a0a0a] flex items-center justify-center shrink-0">
              <span className="text-[10px] font-semibold text-white">{userInitials}</span>
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#0a0a0a] truncate leading-none">{userDisplayName}</p>
                <p className="text-xs text-[#999] mt-0.5 leading-none truncate">{userSubtext}</p>
              </div>
            )}
            {collapsed && (
              <span className="pointer-events-none absolute left-full ml-3 px-2 py-1.5 bg-[#111] text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-lg">
                My Profile
              </span>
            )}
          </Link>
        </div>

      </aside>
    </div>
  );
}
