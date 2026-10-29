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
