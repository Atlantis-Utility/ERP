import { matchScore, nameTokens, nameWordsMatch } from "./name-match";

/**
 * Which customer a GDMS device belongs to.
 *
 * GDMS has no notion of our customers: a device carries a site name
 * somebody typed, like "GoligerLeather" or "Yolandas Mexican Cafe -
 * Camarillo". Matching that to a company needs two things the generic
 * fuzzy score doesn't give on its own.
 *
 * First, it has to be strict. A score of 0.6 was enough to read "B&B Do It
 * Center Camarillo" as "Camarillo Travel", which would have put one
 * customer's ATA on another customer's page. Squashing punctuation and
 * spaces and asking that one name contain the other keeps the real pairs
 * ("Channel Islands Floorcoverings" against "Channel Islands Floor
 * Coverings", "Famcon Pipe" against "Famcon Pipe & Supply, Inc") and
 * refuses that one.
 *
 * Second, it should be exclusive where it can be. "Pizza Man Dans" is
 * contained in seven of our company names, and seven pages each claiming
 * the same seven devices is worse than one page claiming them, so with the
 * full customer list to hand the device goes to the single closest company.
 */
function squash(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Every significant word of the site name is in the company name. This is
 * what reaches the sites named for a location rather than spelled like the
 * company: "Yolandas Ventura" against "Yolanda's Mexican Cafe - Ventura",
 * "IHOP 746" against the management company that runs store 746. Two words
 * minimum, so a single common word can't drag in a stranger, and every one
 * of them has to land.
 */
function everyWordIsIn(site: string, company: string): boolean {
  const words = nameTokens(site);
  const inCompany = nameTokens(company);
  if (words.length < 2 || inCompany.length === 0) return false;
  return words.every((w) => inCompany.some((c) => wordIsThatWord(w, c)));
}

/**
 * Word-level matching tight enough for this rule, where one word carries a
 * whole match. The general fuzzy comparison allows an edit per four
 * letters, which is how "Greek Ventura" read as "Green Thumb ... Ventura"
 * and IHOP store 769 read as store 766. A word with a digit in it is an
 * identifier and has to be exact; a short word has to be exact too,
 * because at five letters one edit is most of the difference between two
 * unrelated words. Spelling is only forgiven on a word long enough that a
 * near miss is a near miss: "Yolandas" against "Yolanda".
 */
function wordIsThatWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (/\d/.test(a) || /\d/.test(b)) return false;
  if (Math.min(a.length, b.length) < 6) return false;
  return nameWordsMatch(a, b);
}

/** Strict enough that a near-miss is a miss. */
export function siteNameFits(site: string, company: string): boolean {
  const a = squash(site);
  const b = squash(company);
  if (a.length < 4 || b.length < 4) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  return everyWordIsIn(site, company);
}

/** GDMS's catch-all bucket belongs to nobody in particular. */
function namedSite(site: string | undefined): string {
  const s = (site ?? "").trim();
  return s.toLowerCase() === "default" ? "" : s;
}

/**
 * The company this site name belongs to, out of all of them: the closest of
 * the ones it fits, so a site fitting several lands on exactly one.
 */
export function bestCompanyForSite<T extends { id: string; company: string }>(
  site: string,
  customers: readonly T[],
): T | null {
  const fits = customers.filter((c) => siteNameFits(site, c.company));
  if (fits.length <= 1) return fits[0] ?? null;
  return [...fits].sort((a, b) => {
    const byScore = matchScore(b.company, site) - matchScore(a.company, site);
    if (byScore !== 0) return byScore;
    // A tie on score goes to the shorter name: the one carrying the least
    // beyond what the site name actually said.
    return a.company.length - b.company.length;
  })[0];
}

/**
 * This customer's GDMS devices. `allCustomers` is every company, which is
 * how a site fitting several of them is given to one; without it (the
 * customers list hasn't been cached yet) the fit alone decides, which can
 * show one site's devices on two sibling stores but never on a stranger.
 */
export function gdmsDevicesForCustomer<D extends { siteName?: string }, C extends { id: string; company: string }>(
  devices: readonly D[],
  customer: { id: string; company: string },
  allCustomers: readonly C[],
): D[] {
  // Resolved per site rather than per device: one lookup for a site with
  // seven devices on it.
  const mine = new Map<string, boolean>();
  return devices.filter((d) => {
    const site = namedSite(d.siteName);
    if (!site) return false;
    if (!mine.has(site)) {
      mine.set(
        site,
        allCustomers.length > 0
          ? bestCompanyForSite(site, allCustomers)?.id === customer.id
          : siteNameFits(site, customer.company),
      );
    }
    return mine.get(site)!;
  });
}
