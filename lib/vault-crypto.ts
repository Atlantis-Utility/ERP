import crypto from "crypto";

// Server-only. Never import this from a "use client" component, it uses
// Node's crypto module and a secret that must never reach the browser.
const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.VAULT_ENCRYPTION_KEY;
  if (!raw) throw new Error("VAULT_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("VAULT_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

// Fresh random IV per call, required for GCM, never reuse an IV with the same key.
export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(secret: EncryptedSecret): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// ── Vault passkey hashing ───────────────────────────────────────────────
// The passkey is an app-level unlock gate, not a key-derivation secret.
// Vault entries stay encrypted with VAULT_ENCRYPTION_KEY regardless. Only
// the hash+salt are ever persisted; the passkey itself never is.
const SCRYPT_KEYLEN = 64;

export interface HashedPasskey {
  hash: string; // base64
  salt: string; // base64
}

export function hashPasskey(passkey: string): HashedPasskey {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(passkey, salt, SCRYPT_KEYLEN);
  return { hash: hash.toString("base64"), salt: salt.toString("base64") };
}

export function verifyPasskey(passkey: string, stored: HashedPasskey): boolean {
  const salt = Buffer.from(stored.salt, "base64");
  const expected = Buffer.from(stored.hash, "base64");
  const actual = crypto.scryptSync(passkey, salt, SCRYPT_KEYLEN);
  // Lengths always match (fixed SCRYPT_KEYLEN), timingSafeEqual throws on
  // mismatched lengths, which would otherwise leak a length oracle.
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
