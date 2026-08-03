// Fuzzy matching between two free-text organization names (e.g. a RingLogix
// customer's company name vs. a UniFi site name or a project's client name).
// Names drift across systems — different capitalization, missing/extra legal
// suffixes, typos, or words merged/split differently ("Del Mar Seafoods, Inc."
// vs. "DelMar Seafood") — so exact/substring matching misses too much.
const STOPWORDS = new Set([
  "llc", "inc", "incorporated", "corp", "corporation", "co", "company", "ltd",
  "dba", "and", "the", "of", "group", "enterprises", "services", "solutions",
  "holdings", "a", "an", "for", "in", "at", "by",
]);

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Two words "match" if identical, or close enough in spelling (allows ~1
// edit per 4 letters — enough for a missing/swapped letter, not enough to
// match unrelated words).
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  const maxLen = Math.max(a.length, b.length);
  return levenshtein(a, b) <= Math.max(1, Math.floor(maxLen * 0.25));
}

// Fraction (0–1) of nameA's significant words that have a fuzzy match among
// nameB's words, weighted by word length so short filler words don't dominate.
function wordOverlapScore(nameA: string, nameB: string): number {
  const aWords = tokenize(nameA);
  const bWords = tokenize(nameB);
  if (aWords.length === 0 || bWords.length === 0) return 0;
  let matchedWeight = 0;
  let totalWeight = 0;
  for (const w of aWords) {
    totalWeight += w.length;
    if (bWords.some((bw) => wordsMatch(w, bw))) matchedWeight += w.length;
  }
  return totalWeight > 0 ? matchedWeight / totalWeight : 0;
}

// Catches names that got merged/split differently across systems by comparing
// the words jammed together with no spaces, where word-boundary matching above
// would miss it.
function joinedSimilarity(nameA: string, nameB: string): number {
  const a = tokenize(nameA).join("");
  const b = tokenize(nameB).join("");
  if (a.length === 0 || b.length === 0) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

export function matchScore(nameA: string, nameB: string): number {
  return Math.max(wordOverlapScore(nameA, nameB), joinedSimilarity(nameA, nameB));
}

export const LIKELY_MATCH_THRESHOLD = 0.6;
