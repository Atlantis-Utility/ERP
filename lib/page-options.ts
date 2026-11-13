/**
 * Grants that live *inside* a page rather than deciding whether you reach it.
 *
 * Page access (lib/nav-pages.ts) is all-or-nothing: you hold /customers or
 * you don't. That isn't enough for money. Somebody who answers the phone
 * needs the customer, their contacts, their extensions and their circuits —
 * and has no business knowing what the account owes or what Atlantis pays
 * for the line. Before this, handing over the Customers page handed over
 * both.
 *
 * So: a page option is a second checkbox under the page it belongs to.
 * It only means anything to somebody who already holds that page, and it is
 * stored separately from `access` (employees.data.pageOptions) so nothing
 * that walks the grant list as a list of routes trips over it.
 *
 * Administrators hold every option by definition — the Employees page calls
 * that role "Administrator: Full access", and the drawer shows these ticked
 * and fixed for them, the same way it treats dashboard panels.
 */

export interface PageOption {
  /** Stored in employees.data.pageOptions. Never a route. */
  key: string;
  /** The NAV_PAGES href this hangs off; meaningless without that grant. */
  page: string;
  label: string;
  hint: string;
}

/** Balances, credit limits, and what we pay upstream for their circuits. */
export const CUSTOMER_BILLING = "customers:billing";

export const PAGE_OPTIONS: PageOption[] = [
  {
    key: CUSTOMER_BILLING,
    page: "/customers",
    label: "Billing details",
    hint: "Balance, credit limit, and what we're billed for their internet. Off, the page loads without them.",
  },
];

export function optionsForPage(href: string): PageOption[] {
  return PAGE_OPTIONS.filter((o) => o.page === href);
}

export function isPageOption(key: string): boolean {
  return PAGE_OPTIONS.some((o) => o.key === key);
}

/**
 * Whether this person holds an option.
 *
 * `unrestricted` is auth-context's `isUnrestricted` — Administrator, or a
 * login with no employee record behind it. Everyone else needs the grant
 * spelled out: absent means no, so a page option is never something you get
 * by accident.
 */
export function hasPageOption(
  key: string,
  who: { isUnrestricted?: boolean; pageOptions?: string[] } | null | undefined,
): boolean {
  if (!who) return false;
  if (who.isUnrestricted) return true;
  return (who.pageOptions ?? []).includes(key);
}
