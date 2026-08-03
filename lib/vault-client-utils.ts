// Browser-only helpers for the password vault UI (generation, strength, clipboard hygiene).

const CHARSETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{}",
};

export function generateStrongPassword(length = 20): string {
  const all = CHARSETS.lower + CHARSETS.upper + CHARSETS.digits + CHARSETS.symbols;
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  const pwd = Array.from(bytes, (b) => all[b % all.length]).join("");

  const hasAllClasses = Object.values(CHARSETS).every((set) => [...pwd].some((c) => set.includes(c)));
  return hasAllClasses ? pwd : generateStrongPassword(length);
}

export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string };

export function estimatePasswordStrength(pwd: string): PasswordStrength {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 14) score++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
  if (/\d/.test(pwd) && /[^a-zA-Z0-9]/.test(pwd)) score++;
  const clamped = Math.min(score, 4) as PasswordStrength["score"];
  const labels = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
  return { score: clamped, label: labels[clamped] };
}

// Copies to clipboard and wipes it again after `ms`, mirrors the auto-clear
// behavior of dedicated password managers so a copied secret doesn't sit in
// the OS clipboard indefinitely.
export async function copyWithAutoClear(text: string, ms = 20_000): Promise<void> {
  await navigator.clipboard.writeText(text);
  setTimeout(async () => {
    try {
      const current = await navigator.clipboard.readText();
      if (current === text) await navigator.clipboard.writeText("");
    } catch {
      // Clipboard read may be blocked by browser permissions, clear unconditionally.
      try { await navigator.clipboard.writeText(""); } catch {}
    }
  }, ms);
}
