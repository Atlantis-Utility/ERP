export type CustomerStatusKey = "open" | "suspended" | "terminated" | "other";

export function customerStatusKey(status: string): CustomerStatusKey {
  const s = status.toLowerCase();
  if (s === "open") return "open";
  if (s === "suspended") return "suspended";
  if (s.startsWith("terminat")) return "terminated";
  return "other";
}

/** Balance strings look like "32.37 (Credit)" or "200 (Owed)" — normalize to a signed
 *  number so it can be sorted/summed: positive = owed, negative = credit balance. */
export function balanceAmount(balance: string): number {
  const n = parseFloat(balance.replace(/[^0-9.-]/g, "")) || 0;
  return /credit/i.test(balance) ? -n : n;
}

export function creditLimitAmount(creditLimit: string): number {
  return parseFloat(creditLimit.replace(/[^0-9.-]/g, "")) || 0;
}
