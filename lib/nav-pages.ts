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
// Sections are the grouping the Edit Employee drawer shows, so they're named
// for the job a person does rather than the system a page happens to talk to:
// an admin granting access thinks "this person does sales", not "this person
// needs the RingLogix API". Grants are stored as hrefs, so regrouping or
// renaming a section never invalidates an existing grant.
//
// Nesting matters: AuthGuard matches the longest href, so "/leads/campaigns"
// is granted separately from "/leads" and covers "/leads/campaigns/<id>".
// Detail routes with no entry of their own inherit their parent
// ("/customers/123" is gated by "/customers").
//
// Deliberately absent: /account, which is the signed-in user's own profile and
// should never be revocable.
export const NAV_PAGES: NavPage[] = [
  { href: "/",              label: "Dashboard",     section: "Workspace"   },
  { href: "/quick-access",  label: "Quick Access",  section: "Workspace"   },

  // Campaigns is separate from Leads on purpose: a caller can be given a
  // campaign to work without being handed the whole lead database.
  { href: "/leads",           label: "Leads",     section: "Sales" },
  { href: "/leads/campaigns", label: "Campaigns", section: "Sales" },

  { href: "/customers",     label: "Customers",     section: "Customers"   },
  { href: "/contacts",      label: "Contacts",      section: "Customers"   },
  { href: "/departments",   label: "Departments",   section: "Customers"   },

  { href: "/tickets",       label: "Tickets",       section: "Support"     },

  // Telephony. Most of these are hidden from the sidebar today (the RingLogix
  // group is commented out in components/layout/Sidebar.tsx) but the routes
  // are live, so they still need to be grantable rather than open.
  { href: "/subscribers",   label: "Subscribers",   section: "RingLogix"   },
  { href: "/phone-numbers", label: "Phone Numbers", section: "RingLogix"   },
  { href: "/call-records",  label: "Call Records",  section: "RingLogix"   },
  { href: "/recordings",    label: "Recordings",    section: "RingLogix"   },
  { href: "/devices",       label: "Devices",       section: "RingLogix"   },
  { href: "/device-models", label: "Device Models", section: "RingLogix"   },
  { href: "/queues",        label: "Queues",        section: "RingLogix"   },
  { href: "/conferences",   label: "Conferences",   section: "RingLogix"   },
  { href: "/dial-rules",    label: "Dial Rules",    section: "RingLogix"   },
  { href: "/wake-up-calls", label: "Wake-Up Calls", section: "RingLogix"   },
  { href: "/billing",       label: "Billing",       section: "RingLogix"   },

  { href: "/sites",         label: "Sites",         section: "UniFi"       },
  { href: "/alerts",        label: "Alerts",        section: "UniFi"       },

  { href: "/gdms",          label: "GDMS",          section: "GDMS"        },

  // Operations order mirrors the sidebar (components/layout/Sidebar.tsx) so the
  // per-page permission checkboxes read in the same order the user navigates in.
  { href: "/tasks",         label: "Tasks",         section: "Operations"  },
  { href: "/calendar",      label: "Calendar",      section: "Operations"  },
  { href: "/projects",      label: "Projects",      section: "Operations"  },
  { href: "/notes",         label: "Notes",         section: "Operations"  },
  { href: "/reports",       label: "Reports",       section: "Operations"  },
  { href: "/inventory",     label: "Inventory",     section: "Operations"  },
  { href: "/logs",          label: "Logs",          section: "Operations"  },

  { href: "/employees",     label: "Employees",     section: "People"      },

  { href: "/vault",         label: "Vault",         section: "Security"    },
  { href: "/settings",      label: "Settings",      section: "Settings"    },
];

export const ALL_HREFS = NAV_PAGES.map((p) => p.href);

/**
 * Mirrors AuthGuard's rule: `undefined` access means unrestricted, and a
 * route with no entry of its own is covered by the longest matching parent.
 * Use it to hide UI that leads somewhere the guard would 404 on, so a link
 * isn't offered and then refused.
 */
export function hasPageAccess(href: string, access: string[] | undefined): boolean {
  if (!access) return true;
  const page = NAV_PAGES.filter((p) =>
    p.href === "/" ? href === "/" : href === p.href || href.startsWith(`${p.href}/`)
  ).sort((a, b) => b.href.length - a.href.length)[0];
  if (!page) return true;
  return access.includes(page.href);
}
