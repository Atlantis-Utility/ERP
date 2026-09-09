// Wholesale internet circuits Atlantis buys and rebills — one entry per
// service location, transcribed from each upstream provider's monthly invoice.
//
// Why this exists: UniFi reports the ISP that owns the WAN IP block, which for
// a reseller handoff is the upstream carrier, not the company we actually pay.
// So the Customers and Sites pages fall back to this registry to answer "who
// is this customer's ISP" — anything typed by hand into a customer's profile
// still wins over what's here.
//
// Keeping it current: when a new invoice arrives, update the provider's
// `invoice` block and add/remove/reprice the service rows. `checkInvoiceTotals`
// re-adds every row plus credits so a mistranscription shows up immediately.

import { matchScore, LIKELY_MATCH_THRESHOLD } from "./name-match";

export type IspProviderKey = "advantage-wisp" | "lytwave";

export interface IspProviderInfo {
  key: IspProviderKey;
  name: string;
  website: string;
  portal: string;
  phone: string;
  email: string;
  /** Our account with them, as printed on the invoice. */
  account: string;
  invoice: {
    number: string;
    date: string;          // ISO — invoice date
    dueDate: string;       // ISO
    servicePeriod: string; // human label for the period being billed
    terms: string;
    total: number;
    paid: boolean;
  };
  /** Invoice lines that aren't a circuit (e.g. our reseller commission). */
  credits: Array<{ label: string; amount: number }>;
}

export interface IspService {
  provider: IspProviderKey;
  /** Company as billed, normalized to the shortest confident name. */
  customer: string;
  /** Site qualifier when one company has several locations ("Lewis Rd"). */
  location?: string;
  /** The provider's own plan/SKU label. */
  plan: string;
  downMbps?: number;
  upMbps?: number;
  /** Monthly circuit cost to us, excluding static IPs. */
  monthlyRate: number;
  staticIps: number;
  staticIpRate: number;
  /** Failover circuits map to the customer's Backup ISP, not their primary. */
  role: "primary" | "backup";
  /** Service address as printed, when the invoice gives one. */
  address?: string;
  note?: string;
}

export const ISP_PROVIDERS: Record<IspProviderKey, IspProviderInfo> = {
  "advantage-wisp": {
    key: "advantage-wisp",
    name: "Advantage WISP",
    website: "advantagewisp.com",
    portal: "https://myaccount.advantagewisp.com/account-manager/",
    phone: "(805) 500-8081",
    email: "billing@advantagewisp.com",
    account: "alankosh · customer 1463261",
    invoice: {
      number: "39909",
      date: "2026-08-18",
      dueDate: "2026-09-01",
      servicePeriod: "Sep 1 – Sep 30, 2026",
      terms: "Autopay on the 1st of the month",
      total: 1077.22,
      paid: false,
    },
    credits: [{ label: "Commission (recurring)", amount: -227.78 }],
  },
  lytwave: {
    key: "lytwave",
    name: "Lytwave",
    website: "lytwave.com",
    portal: "https://pay.lytwave.com/dashboard/history",
    phone: "(805) 866-5678",
    email: "customerservice@lytwave.com",
    account: "Alan Kosh · Atlantis Utility",
    invoice: {
      number: "24506",
      date: "2026-08-15",
      dueDate: "2026-08-15",
      servicePeriod: "Aug 2026",
      terms: "Due on receipt",
      total: 1454.98,
      paid: true,
    },
    credits: [],
  },
};

// Advantage WISP invoice 39909. Static-IP lines are folded into the circuit
// they belong to rather than listed separately.
const ADVANTAGE_SERVICES: IspService[] = [
  {
    provider: "advantage-wisp",
    customer: "Telecare",
    location: "Lewis Rd",
    plan: "100x30 Business",
    downMbps: 100,
    upMbps: 30,
    monthlyRate: 300,
    staticIps: 0,
    staticIpRate: 0,
    role: "primary",
  },
  {
    provider: "advantage-wisp",
    customer: "Stevensons Restaurant Supply",
    plan: "Business Class Internet Service 100 Mbps",
    downMbps: 100,
    monthlyRate: 100,
    staticIps: 0,
    staticIpRate: 0,
    role: "primary",
    note: "Billed as \"Stevensons Resturant Supply\" on the invoice.",
  },
  {
    provider: "advantage-wisp",
    customer: "Golden State Flowers",
    plan: "Ventura 50 Mbps Internet Service",
    downMbps: 50,
    monthlyRate: 75,
    staticIps: 1,
    staticIpRate: 15,
    role: "primary",
  },
  {
    provider: "advantage-wisp",
    customer: "ARP",
    plan: "Business Class Internet Service 100 Mbps",
    downMbps: 100,
    monthlyRate: 200,
    staticIps: 1,
    staticIpRate: 15,
    role: "primary",
  },
  {
    provider: "advantage-wisp",
    customer: "ARP Black Oxide",
    plan: "Business Class Internet Service 50 Mbps",
    downMbps: 50,
    monthlyRate: 180,
    staticIps: 1,
    staticIpRate: 15,
    role: "primary",
  },
  {
    provider: "advantage-wisp",
    customer: "Union Engineering",
    plan: "Internet Service",
    monthlyRate: 100,
    staticIps: 1,
    staticIpRate: 15,
    role: "primary",
    note: "Invoice line carries no speed — plan listed as \"Union Engineering\" only.",
  },
  {
    provider: "advantage-wisp",
    customer: "Unit 2",
    plan: "Ventura 50 Mbps Internet Service",
    downMbps: 50,
    monthlyRate: 60,
    staticIps: 0,
    staticIpRate: 0,
    role: "primary",
  },
  {
    provider: "advantage-wisp",
    customer: "Channel Islands Floor Covering",
    plan: "100x20",
    downMbps: 100,
    upMbps: 20,
    monthlyRate: 75,
    staticIps: 0,
    staticIpRate: 0,
    role: "primary",
  },
  {
    provider: "advantage-wisp",
    customer: "Goliger Leather",
    plan: "Atlantis 50 Mbps",
    downMbps: 50,
    monthlyRate: 60,
    staticIps: 0,
    staticIpRate: 0,
    role: "primary",
  },
  {
    provider: "advantage-wisp",
    customer: "Beardsley and Sons",
    plan: "Backup 100 Mbps Internet Service",
    downMbps: 100,
    monthlyRate: 40,
    staticIps: 0,
    staticIpRate: 0,
    role: "backup",
  },
  {
    provider: "advantage-wisp",
    customer: "PMD",
    location: "Annex",
    plan: "50x20 Backup",
    downMbps: 50,
    upMbps: 20,
    monthlyRate: 40,
    staticIps: 1,
    staticIpRate: 15,
    role: "backup",
  },
];

// Lytwave invoice 24506.
const LYTWAVE_SERVICES: IspService[] = [
  {
    provider: "lytwave",
    customer: "J H Biotech",
    plan: "2024-FW-60G-Business-Custom-500x500 MTM",
    downMbps: 500,
    upMbps: 500,
    monthlyRate: 199.99,
    staticIps: 2,
    staticIpRate: 15,
    role: "primary",
    address: "4951 Olivas Park Dr, Ventura, CA 93003",
  },
  {
    provider: "lytwave",
    customer: "Clark Engineering Construction",
    plan: "2020-FW-5G-Business Gold 60x20 MTM",
    downMbps: 60,
    upMbps: 20,
    monthlyRate: 112,
    staticIps: 0,
    staticIpRate: 0,
    role: "primary",
    address: "230 Dove Court, Santa Paula, CA 93060",
    note: "List $139.99 — reseller discount approved by AA.",
  },
  {
    provider: "lytwave",
    customer: "Pleasant Valley County Water District",
    plan: "2020-FW-5G-Business Gold 60x20 MTM",
    downMbps: 60,
    upMbps: 20,
    monthlyRate: 100,
    staticIps: 0,
    staticIpRate: 0,
    role: "primary",
    address: "154 South Las Posas Road, Camarillo, CA 93010",
    note: "List $139.99 — reseller discount approved by AA.",
  },
  {
    provider: "lytwave",
    customer: "Ventura Auto Body",
    plan: "2020-FW-5G-Business Gold 60x20 MTM",
    downMbps: 60,
    upMbps: 20,
    monthlyRate: 100,
    staticIps: 0,
    staticIpRate: 0,
    role: "primary",
    address: "1649 Palma Drive, Unit A, Ventura, CA 93003",
    note: "List $139.99 — reseller discount approved by AA.",
  },
  {
    provider: "lytwave",
    customer: "Paseo Flowers",
    plan: "2021-FW-5G-Business Platinum 100x30 MTM",
    downMbps: 100,
    upMbps: 30,
    monthlyRate: 100,
    staticIps: 0,
    staticIpRate: 0,
    role: "primary",
    address: "4082 Southbank Road, Suite F, Oxnard, CA 93036",
    note: "Wholesale discount approved by AA.",
  },
  {
    provider: "lytwave",
    customer: "Quality Upholstery",
    plan: "2021-fw-5ac-business custom symmetrical 20x20 MTM",
    downMbps: 20,
    upMbps: 20,
    monthlyRate: 56,
    staticIps: 0,
    staticIpRate: 0,
    role: "primary",
    address: "5770 Nicolle St., Suite 14, Ventura, CA 93003",
    note: "Wholesale discount approved by AA.",
  },
  {
    provider: "lytwave",
    customer: "B & L Plumbing",
    plan: "2020-FW-5G-Business Bronze 20x20 MTM",
    downMbps: 20,
    upMbps: 20,
    monthlyRate: 56,
    staticIps: 0,
    staticIpRate: 0,
    role: "primary",
    address: "1580 Saratoga Ave, Suite D, Ventura, CA 93003",
    note: "Reseller discount approved by AA.",
  },
  {
    provider: "lytwave",
    customer: "Del Mar Seafoods",
    plan: "2020-FW-5G-Business Silver 40x20 MTM",
    downMbps: 40,
    upMbps: 20,
    monthlyRate: 80,
    staticIps: 1,
    staticIpRate: 15,
    role: "primary",
    address: "924 East 3rd Street, Oxnard, CA 93030",
    note: "Reseller discount approved by AA.",
  },
  {
    provider: "lytwave",
    customer: "The River Community Church",
    plan: "LW2025-FW-5G-Business Backup Basic 20x20 MTM",
    downMbps: 20,
    upMbps: 20,
    monthlyRate: 27.99,
    staticIps: 0,
    staticIpRate: 0,
    role: "backup",
    address: "889 E. Santa Clara Street, Ventura, CA 93003",
    note: "List $34.99 — reseller discount approved by CDB.",
  },
  {
    provider: "lytwave",
    customer: "Dynamic Flow Physical Therapy",
    plan: "2020-FW-5G-Business Bronze 20x20 MTM",
    downMbps: 20,
    upMbps: 20,
    monthlyRate: 56,
    staticIps: 0,
    staticIpRate: 0,
    role: "primary",
    address: "2850 E. Main St., Suite 205, Ventura, CA 93003",
    note: "Reseller discount approved by AA.",
  },
  {
    provider: "lytwave",
    customer: "999 Pizza",
    plan: "Custom Business Wireless Fiber 100x100",
    downMbps: 100,
    upMbps: 100,
    monthlyRate: 112,
    staticIps: 5,
    staticIpRate: 10,
    role: "primary",
    address: "420 E Santa Clara St, Ventura, CA 93001",
    note: "Reseller discount approved by AA; static IPs discounted to $10 each.",
  },
  {
    provider: "lytwave",
    customer: "Specialty Marine",
    plan: "2021-FW-5G-Business Platinum 100x30 MTM",
    downMbps: 100,
    upMbps: 30,
    monthlyRate: 100,
    staticIps: 0,
    staticIpRate: 0,
    role: "primary",
    address: "3151 W 5th St, STE G, Oxnard, CA 93030",
    note: "Reseller discount approved by AA.",
  },
  {
    provider: "lytwave",
    customer: "Ocean Pride Seafood",
    plan: "LW2024-FW-5G-Business Plus+ 40x25 MTM",
    downMbps: 40,
    upMbps: 25,
    monthlyRate: 80,
    staticIps: 0,
    staticIpRate: 0,
    role: "primary",
    address: "2894 Bunsen Ave, Unit B, Ventura, CA 93003",
    note: "SKU says 40x25, line description says 40x20 — confirm with Lytwave.",
  },
  {
    provider: "lytwave",
    customer: "Salzer's",
    plan: "2021-FW-5G-Business Platinum 100x30 MTM",
    downMbps: 100,
    upMbps: 30,
    monthlyRate: 150,
    staticIps: 2,
    staticIpRate: 15,
    role: "primary",
    address: "5777 Valentine Rd, Ventura, CA 93003",
    note: "SKU says 100x30, line description says 40x20 — confirm with Lytwave.",
  },
];

export const ISP_SERVICES: IspService[] = [...ADVANTAGE_SERVICES, ...LYTWAVE_SERVICES];

/** What this circuit costs us per month, static IPs included. */
export function serviceMonthlyTotal(s: IspService): number {
  return s.monthlyRate + s.staticIps * s.staticIpRate;
}

/** "100 × 30 Mbps", "100 Mbps down", or "" when the invoice omits the speed. */
export function formatSpeed(s: IspService): string {
  if (s.downMbps && s.upMbps) return `${s.downMbps} × ${s.upMbps} Mbps`;
  if (s.downMbps) return `${s.downMbps} Mbps`;
  return "";
}

export function serviceLabel(s: IspService): string {
  return s.location ? `${s.customer} — ${s.location}` : s.customer;
}

// matchScore is directional — it scores how much of the first name is covered
// by the second, so a short name like "ARP" scores a perfect 1.0 against
// "ARP Black Oxide". Taking the weaker direction keeps those two apart.
function pairScore(a: string, b: string): number {
  return Math.min(matchScore(a, b), matchScore(b, a));
}

function serviceScore(name: string, s: IspService): number {
  const withLocation = s.location ? pairScore(name, `${s.customer} ${s.location}`) : 0;
  return Math.max(pairScore(name, s.customer), withLocation);
}

// Fuzzy matching is Levenshtein-heavy and gets re-run on every render (site
// grids re-filter on each keystroke), so memoize per name — the table is static.
const matchCache = new Map<string, BilledIsp | null>();

export interface BilledIsp {
  /** The invoice's name for this customer — may differ from ours. */
  customer: string;
  primary?: IspService;
  backup?: IspService;
  services: IspService[];
}

/**
 * Looks up what we're billed for a company (RingLogix customer or UniFi site
 * name) across every provider invoice. Returns null when nothing matches
 * confidently — a wrong ISP is worse than a blank one.
 */
export function findBilledIsp(companyName: string): BilledIsp | null {
  if (!companyName?.trim()) return null;
  const cached = matchCache.get(companyName);
  if (cached !== undefined) return cached;

  let bestScore = 0;
  let bestKey = "";
  for (const s of ISP_SERVICES) {
    const score = serviceScore(companyName, s);
    if (score >= LIKELY_MATCH_THRESHOLD && score > bestScore) {
      bestScore = score;
      bestKey = serviceLabel(s);
    }
  }
  // A location can carry both a primary and a failover circuit (sometimes from
  // different providers), so collect every row sharing the winning name.
  const services = ISP_SERVICES.filter((s) => serviceLabel(s) === bestKey);
  const result: BilledIsp | null = bestKey
    ? {
        customer: bestKey,
        primary: services.find((s) => s.role === "primary"),
        backup: services.find((s) => s.role === "backup"),
        services,
      }
    : null;

  matchCache.set(companyName, result);
  return result;
}

/**
 * "Invoice #39909", or "Invoices #39909, #24506" when a location's primary and
 * failover circuits are bought from two different providers.
 */
export function billedInvoiceRefs(billed: BilledIsp): string {
  const numbers = Array.from(
    new Set(billed.services.map((s) => ISP_PROVIDERS[s.provider].invoice.number))
  );
  const refs = numbers.map((n) => `#${n}`).join(", ");
  return numbers.length === 1 ? `Invoice ${refs}` : `Invoices ${refs}`;
}

/** The provider we buy this location's circuit from — primary first. */
export function resellerFor(companyName: string): IspProviderInfo | null {
  const billed = findBilledIsp(companyName);
  const service = billed?.primary ?? billed?.backup;
  return service ? ISP_PROVIDERS[service.provider] : null;
}

/**
 * Re-adds a provider's rows against the invoice total it came from. Exported
 * so a transcription slip surfaces as a number, not a silent wrong bill.
 */
export function checkInvoiceTotals(key: IspProviderKey): { expected: number; actual: number; ok: boolean } {
  const provider = ISP_PROVIDERS[key];
  const services = ISP_SERVICES.filter((s) => s.provider === key)
    .reduce((sum, s) => sum + serviceMonthlyTotal(s), 0);
  const credits = provider.credits.reduce((sum, c) => sum + c.amount, 0);
  const actual = Math.round((services + credits) * 100) / 100;
  return { expected: provider.invoice.total, actual, ok: actual === provider.invoice.total };
}
