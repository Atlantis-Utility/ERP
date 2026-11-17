// Matching a vendor record to the ISP names typed on customers.
//
// Nobody types the same name twice. The vendor is "Spectrum Business" and
// the customers say "Spectrum" (12 of them) and "Spectrum Business" (4);
// "T-Mobile Business" against "T-Mobile USA"; "Frontier" against "Frontier
// Communications"; "AT&T Business" against "AT&T Internet", "AT&T" and
// "AT&T Business".
//
// Deliberately not the fuzzy matcher in lib/name-match.ts. These are eight
// known providers, not ten thousand company names, and the failure that
// matters is a wrong join - listing somebody's circuit under the wrong
// carrier - so this errs towards missing a match rather than inventing one.
// "Airlink Internet, Inc." and "AT&T Internet" share a word and must not
// match.

/**
 * Words that say what kind of company it is rather than which one. Stripped
 * from the end repeatedly, so "Airlink Internet, Inc." reduces past "inc"
 * and then past "internet".
 */
const GENERIC = [
  "business", "communications", "communication", "internet", "broadband",
  "wisp", "telecom", "telecommunications", "fiber", "fibre", "wireless",
  "networks", "network", "services", "service", "solutions", "systems",
  "usa", "us", "inc", "llc", "ltd", "corp", "corporation", "co", "company",
  "group", "holdings", "the",
];

/**
 * What a name boils down to: "AT&T Internet" and "AT&T Business" both to
 * "att", "Spectrum Business" to "spectrum".
 */
export function ispKey(name: string): string {
  let key = (name ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
  // "atandt" is what "AT&T" becomes, and no customer writes it that way.
  key = key.replace(/^atandt/, "att");
  let trimmed = true;
  while (trimmed) {
    trimmed = false;
    for (const word of GENERIC) {
      if (key.length > word.length + 2 && key.endsWith(word)) {
        key = key.slice(0, -word.length);
        trimmed = true;
      }
    }
  }
  return key;
}

/**
 * Whether two names are the same provider: the same key, and nothing
 * looser.
 *
 * A first version also matched a key that was a prefix of the other, meant
 * to cover a suffix the generic list might miss. It covered nothing the
 * list doesn't already - "Frontier Communications" reduces to "frontier" on
 * its own - and it matched "Frontier" to "Frontier Airlines Cargo", which
 * is the kind of wrong join this is supposed to avoid. A provider the list
 * doesn't reduce correctly is a word to add to GENERIC, not a reason to
 * guess.
 */
export function sameIsp(a: string, b: string): boolean {
  const x = ispKey(a);
  const y = ispKey(b);
  return Boolean(x) && x === y;
}

/**
 * The one name we show for each provider.
 *
 * Nobody types the same name twice (see above), so the same carrier arrives
 * as "T-Mobile" and "T-Mobile USA", "Spectrum" and "Spectrum Business",
 * "AT&T", "AT&T Internet" and "AT&T Business". Read back, that is three
 * carriers where there is one - three chips to tick before an outage notice
 * reaches everybody on it, and three rows in any count by provider.
 *
 * Keyed by ispKey, so a spelling nobody anticipated still lands on the right
 * entry as long as it reduces to the same key. A key that isn't here is left
 * exactly as it was typed: an unknown provider is a name we don't have a
 * house style for, not a mistake.
 */
const CANONICAL_ISPS: Record<string, string> = {
  spectrum: "Spectrum",
  tmobile: "T-Mobile",
  att: "AT&T",
  frontier: "Frontier",
  lytwave: "Lytwave",
  airlink: "Airlink",
  advantage: "Advantage WISP",
  verizon: "Verizon",
  starlink: "Starlink",
  comcast: "Comcast",
  cox: "Cox",
  viasat: "Viasat",
  hughesnet: "HughesNet",
};

/** Every provider we have a house spelling for, for a suggestion list. */
export const KNOWN_ISPS: string[] = Object.values(CANONICAL_ISPS).sort((a, b) =>
  a.localeCompare(b),
);

/**
 * How a provider's name should be written, whatever was typed. Unknown
 * providers come back tidied (trimmed, single-spaced) but otherwise as
 * written, and an empty name stays empty.
 */
export function canonicalIsp(name: string): string {
  const written = (name ?? "").trim().replace(/\s+/g, " ");
  if (!written) return "";
  return CANONICAL_ISPS[ispKey(written)] ?? written;
}
