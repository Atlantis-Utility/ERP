import { promises as dns } from "dns";

// UniFi's API has no field for static-vs-DHCP WAN config (confirmed by direct
// testing — the `type` field on a WAN is just its role label, "WAN"/"WAN2").
// The one real signal we do have is the WAN IP itself: ISPs commonly encode
// the allocation type in the reverse-DNS (PTR) hostname they assign to that
// IP — e.g. "static-71-XXX-XXX-XXX.instance.rr.com" vs
// "c-73-XX-XX-XX.hsd1.ca.comcast.net" (the "hsd" = "high speed data"
// residential/dynamic pool marker). This is real evidence *some* ISPs
// publish, not a guess — but plenty of ISPs don't label their PTR records
// this way at all, so "unknown" is a genuine, expected outcome, not a bug.
export type IpAssignmentType = "static" | "dynamic" | "unknown";

export interface IpAssignmentResult {
  type: IpAssignmentType;
  hostname?: string; // the PTR hostname the classification came from, for transparency
}

const STATIC_HINTS = /\bstatic\b|\bfixed\b|\bbiz\b|\bbusiness\b|\bdedicated\b|\bcorp\b/i;
const DYNAMIC_HINTS = /\bdyn(amic)?\b|\bdhcp\b|\bpool\b|\bhsd\d*\b|\bres(idential)?\b|\bcpe\b|\bcable\b|\bdsl\b|\bclient\b/i;

const LOOKUP_TIMEOUT_MS = 2500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

export async function classifyIpAssignment(ip: string): Promise<IpAssignmentResult> {
  if (!ip) return { type: "unknown" };
  try {
    const hostnames = await withTimeout(dns.reverse(ip), LOOKUP_TIMEOUT_MS);
    const hostname = hostnames[0];
    if (!hostname) return { type: "unknown" };
    if (STATIC_HINTS.test(hostname)) return { type: "static", hostname };
    if (DYNAMIC_HINTS.test(hostname)) return { type: "dynamic", hostname };
    return { type: "unknown", hostname };
  } catch {
    return { type: "unknown" };
  }
}
