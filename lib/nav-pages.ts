export interface NavPage {
  href: string;
  label: string;
  section: string;
}

export const NAV_PAGES: NavPage[] = [
  { href: "/",              label: "Dashboard",     section: "RingLogix"  },
  { href: "/customers",     label: "Customers",     section: "RingLogix"  },
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
  { href: "/tasks",         label: "Tasks",         section: "Operations" },
  { href: "/projects",      label: "Projects",      section: "Operations" },
  { href: "/reports",       label: "Reports",       section: "Operations" },
  { href: "/logs",          label: "Logs",          section: "Operations" },
  { href: "/employees",     label: "Employees",     section: "People"     },
  { href: "/settings",      label: "Settings",      section: "Settings"   },
];

export const ALL_HREFS = NAV_PAGES.map((p) => p.href);
