// Shared between client and server, no server-only imports here.

export type VaultCategory =
  | "infrastructure"
  | "hosting"
  | "software"
  | "email"
  | "domain"
  | "financial"
  | "social"
  | "networking"
  | "other";

export const VAULT_CATEGORIES: { value: VaultCategory; label: string }[] = [
  { value: "infrastructure", label: "Infrastructure" },
  { value: "hosting",        label: "Hosting" },
  { value: "software",       label: "Software / SaaS" },
  { value: "email",          label: "Email" },
  { value: "domain",         label: "Domain / DNS" },
  { value: "financial",      label: "Financial" },
  { value: "social",         label: "Social Media" },
  { value: "networking",     label: "Networking" },
  { value: "other",          label: "Other" },
];

// Metadata only, the encrypted password/PIN (ciphertext/iv/authTag) never
// leaves the server via this shape. Plaintext only ever travels over the
// dedicated /reveal endpoint, on explicit user action.
export interface VaultEntryMeta {
  id: string;
  name: string; // "Key Name"
  accountId?: string; // "ID"
  email?: string;
  website?: string;
  phoneNumbers: string[];
  pointsOfContact: string[];
  category: VaultCategory;
  notes?: string;
  tags: string[];
  hasPin: boolean;
  customerId?: string;
  customerName?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  lastRevealedAt?: string;
  lastRevealedBy?: string;
  // Ownership/sharing, computed per-request relative to the caller.
  ownerUid: string | null;
  ownerName: string;
  isOwner: boolean;
  isAdminView: boolean; // true when this row is only visible because the caller is an admin override
  shareCount?: number;  // only populated for the owner/admin, how many people it's shared with
}

export interface VaultShareInfo {
  granteeUid: string;
  granteeName: string;
  granteeEmail: string;
  grantedAt: string;
  grantedByUid: string;
  grantedByName: string;
}

export interface VaultPasskeyStatus {
  hasPasskey: boolean;
  isUnlocked: boolean;
  unlockedUntil?: string;
  lockedUntil?: string;
  msVerified: boolean; // fresh Microsoft re-verification on file, valid for a set/reset action
}

export interface VaultEntryInput {
  name: string;
  accountId?: string;
  email?: string;
  website?: string;
  phoneNumbers?: string[];
  pointsOfContact?: string[];
  category: VaultCategory;
  notes?: string;
  tags?: string[];
  password: string;
  pin?: string;
  customerId?: string;
  customerName?: string;
}

export interface VaultEntryUpdateInput {
  name?: string;
  accountId?: string;
  email?: string;
  website?: string;
  phoneNumbers?: string[];
  pointsOfContact?: string[];
  category?: VaultCategory;
  notes?: string;
  tags?: string[];
  password?: string; // omitted/empty = keep the existing password
  pin?: string;       // omitted/empty = keep the existing PIN
  clearPin?: boolean; // explicit removal, since empty string can't distinguish "keep" from "clear"
  customerId?: string | null;
  customerName?: string | null;
}
