/**
 * What a person sees on the dashboard.
 *
 * The dashboard itself is everybody's: it's the page sign-in lands on, so
 * it isn't something to grant or withhold. What's *on* it is another
 * matter. Unpaid balances, the network's alerts and the headline numbers
 * are management's view of the business, and a caller or a technician has
 * no reason to be shown them.
 *
 * So the page is open and its panels are granted. Until somebody is given
 * more, they get their own day: today's schedule and the project timeline.
 */
export interface DashboardWidget {
  key: string;
  label: string;
  hint: string;
}

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  { key: "schedule", label: "Today's Schedule", hint: "Their meetings and calls for today" },
  { key: "timeline", label: "Project Timeline", hint: "Projects across the months" },
  { key: "activity", label: "Recent Activity", hint: "The notification feed" },
  { key: "kpis", label: "Headline numbers", hint: "Deadlines, overdue projects, unpaid customers, sites, meetings" },
  { key: "network", label: "Network", hint: "UniFi sites, offline counts and alerts" },
  { key: "billing", label: "Customers Needing Attention", hint: "Who owes money, and how much" },
];

/** Everyone gets their own day, and nothing about the business. */
export const DEFAULT_DASHBOARD_WIDGETS = ["schedule", "timeline"];

export const DASHBOARD_WIDGET_KEYS = DASHBOARD_WIDGETS.map((w) => w.key);

/**
 * `undefined` means every panel, which is what an administrator gets and
 * what the absence of an employee record falls back to. An empty list is a
 * deliberate "nothing", not a missing answer, so it is respected.
 */
export function canSeeWidget(key: string, widgets: string[] | undefined): boolean {
  if (!widgets) return true;
  return widgets.includes(key);
}
