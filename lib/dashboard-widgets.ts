/**
 * What a person sees on the dashboard.
 *
 * The dashboard itself is everybody's: it's the page sign-in lands on, so
 * it isn't something to grant or withhold. What's *on* it is another
 * matter. Unpaid balances, the network's alerts and the headline numbers
 * are management's view of the business, and a caller or a technician has
 * no reason to be shown them.
 *
 * So the page is open and its panels are granted. The default follows the
 * pages somebody holds, because that is the only thing the app knows about
 * what their job is: a caller gets their pipeline and their call sheets, a
 * technician gets their tickets, a manager gets the timeline. Everybody
 * gets today's schedule.
 */
export interface DashboardWidget {
  key: string;
  label: string;
  hint: string;
  /**
   * The page this panel is about. The panel is only offered to somebody
   * who holds that page: a leads panel for an account with no Leads page
   * is a window into something they can't open. Absent means "anyone".
   */
  requires?: string;
}

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  { key: "schedule", label: "Today's Schedule", hint: "Their meetings and calls for today" },
  { key: "leads", label: "Leads Progress", hint: "Their pipeline by stage, and the next follow-ups", requires: "/leads" },
  {
    key: "campaigns",
    label: "My Campaigns",
    hint: "Call sheets they're on, and how far through each one is",
    requires: "/leads/campaigns",
  },
  {
    key: "calls",
    label: "Calls Today",
    hint: "What they got through today, by outcome",
    requires: "/leads/campaigns",
  },
  { key: "timeline", label: "Project Timeline", hint: "Projects across the months", requires: "/projects" },
  { key: "work", label: "My Tickets & Tasks", hint: "What's assigned to them, soonest first" },
  {
    key: "timeclock",
    label: "Time Clock",
    hint: "Clocking in and out, and what their day and week add up to",
  },
  { key: "activity", label: "Recent Activity", hint: "The notification feed" },
  { key: "kpis", label: "Headline numbers", hint: "Deadlines, overdue projects, unpaid customers, sites, meetings" },
  { key: "network", label: "Network", hint: "UniFi sites, offline counts and alerts", requires: "/sites" },
  {
    key: "billing",
    label: "Customers Needing Attention",
    hint: "Who owes money, and how much",
    requires: "/customers",
  },
];

/** Fallback for a login with no employee record behind it. */
export const DEFAULT_DASHBOARD_WIDGETS = ["schedule"];

/**
 * Whether a panel is even available to somebody, which is a question about
 * the pages they hold rather than about this list.
 */
export function widgetAvailable(widget: DashboardWidget, access: string[] | undefined): boolean {
  if (!widget.requires) return true;
  return !access || access.includes(widget.requires);
}

export function availableWidgets(access: string[] | undefined): DashboardWidget[] {
  return DASHBOARD_WIDGETS.filter((w) => widgetAvailable(w, access));
}

/**
 * What somebody sees before anyone has chosen for them: their own work,
 * and nothing about the business. The three panels that are the business
 * (the headline numbers, the network, the money) stay off until granted,
 * even for somebody who holds those pages.
 */
// The clock is in here for a different reason than the rest, and it is
// also in GRANT_ONLY below: it isn't management's view of the business,
// it's a thing you give to the people whose hours are being tracked.
const BUSINESS_WIDE = new Set(["kpis", "network", "billing", "activity", "timeclock"]);

export function defaultDashboardWidgets(access: string[] | undefined): string[] {
  const keys = availableWidgets(access)
    .filter((w) => !BUSINESS_WIDE.has(w.key))
    .map((w) => w.key);
  // "work" is offered to everyone, so it would otherwise turn up for a
  // caller who holds neither Tickets nor Tasks and has nothing to show.
  const holds = (href: string) => !access || access.includes(href);
  return keys.filter((k) => k !== "work" || holds("/tickets") || holds("/tasks"));
}

export const DASHBOARD_WIDGET_KEYS = DASHBOARD_WIDGETS.map((w) => w.key);

/**
 * Panels nobody holds by virtue of who they are.
 *
 * Every other panel is a view of something, so "sees everything" covers
 * it. The clock is not a view, it's a thing somebody does: being an
 * administrator makes you the person who tracks other people's hours, not
 * automatically one of the people whose hours are tracked. So the clock
 * stays off for everybody, administrators included, until it is put on a
 * person's list by hand.
 */
const GRANT_ONLY = new Set(["timeclock"]);

export function isGrantOnly(key: string): boolean {
  return GRANT_ONLY.has(key);
}

/**
 * An administrator's panels: all of them, less the grant-only ones, plus
 * whichever of those they were actually given. Spelled out as a list
 * rather than left as `undefined`, because "everything" can no longer say
 * what it needs to say.
 */
export function adminDashboardWidgets(saved: string[] | undefined): string[] {
  const granted = new Set(saved ?? []);
  return DASHBOARD_WIDGET_KEYS.filter((key) => !GRANT_ONLY.has(key) || granted.has(key));
}

/**
 * `undefined` means every panel, which is what the absence of an employee
 * record falls back to. An empty list is a deliberate "nothing", not a
 * missing answer, so it is respected. Either way a grant-only panel is off
 * unless the list names it.
 */
export function canSeeWidget(key: string, widgets: string[] | undefined): boolean {
  if (!widgets) return !GRANT_ONLY.has(key);
  return widgets.includes(key);
}
