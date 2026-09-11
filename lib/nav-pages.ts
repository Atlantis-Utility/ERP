export interface NavPage {
  href: string;
  label: string;
  section: string;
}

// This list is the access-control surface, not just a nav menu: AuthGuard
// treats any route missing from it as ungated (`isAllowed` returns true when
// no entry matches), and EditEmployeeDrawer only offers checkboxes for what's
// here. A new page under app/(dashboard) must be added or it is reachable by
// everyone regardless of their grants.
//
// Deliberately absent: /account, which is the signed-in user's own profile and
// should never be revocable.
export const NAV_PAGES: NavPage[] = [
  { href: "/",              label: "Dashboard",     section: "RingLogix"  },
  { href: "/quick-access",  label: "Quick Access",  section: "RingLogix"  },
  { href: "/customers",     label: "Customers",     section: "RingLogix"  },
  { href: "/tickets",       label: "Tickets",       section: "Support"    },
  { href: "/leads",         label: "Leads",         section: "Sales"      },
  { href: "/subscribers",   label: "Subscribers",   section: "RingLogix"  },
  { href: "/phone-numbers", label: "Phone Numbers", section: "RingLogix"  },
  { href: "/call-records",  label: "Call Records",  section: "RingLogix"  },
  { href: "/recordings",    label: "Recordings",    section: "RingLogix"  },
  { href: "/devices",       label: "Devices",       section: "RingLogix"  },
  { href: "/queues",        label: "Queues",        section: "RingLogix"  },
  { href: "/conferences",   label: "Conferences",   section: "RingLogix"  },
  { href: "/billing",       label: "Billing",       section: "RingLogix"  },
  { href: "/sites",         label: "Sites",         section: "UniFi"      },
  { href: "/alerts",        label: "Alerts",        section: "UniFi"      },
  { href: "/gdms",          label: "GDMS",          section: "GDMS"       },
  // Operations order mirrors the sidebar (components/layout/Sidebar.tsx) so the
  // per-page permission checkboxes read in the same order the user navigates in.
  { href: "/tasks",         label: "Tasks",         section: "Operations" },
  { href: "/calendar",      label: "Calendar",      section: "Operations" },
  { href: "/projects",      label: "Projects",      section: "Operations" },
  { href: "/notes",         label: "Notes",         section: "Operations" },
  { href: "/reports",       label: "Reports",       section: "Operations" },
  { href: "/inventory",     label: "Inventory",     section: "Operations" },
  { href: "/logs",          label: "Logs",          section: "Operations" },
  { href: "/employees",     label: "Employees",     section: "People"     },
  { href: "/vault",         label: "Vault",         section: "Security"   },
  { href: "/settings",      label: "Settings",      section: "Settings"   },
];

export const ALL_HREFS = NAV_PAGES.map((p) => p.href);
