import { createClient } from "./supabase/server";
import { ApiAuthError } from "./api-auth";
import { VAULT_PASSKEYS_TABLE } from "./vault-server";

export interface VaultActor {
  uid: string;
  email: string;
  isAdmin: boolean;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Any authenticated employee, unlike requireAdmin(), this doesn't require
// is_admin. Every vault route needs at least this; admin-only branches then
// check `actor.isAdmin` themselves.
export async function requireVaultSession(supabase: SupabaseServerClient): Promise<VaultActor> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new ApiAuthError("Missing or invalid session", 401);

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin, email")
    .eq("uid", user.id)
    .maybeSingle();

  return {
    uid: user.id,
    email: user.email ?? profile?.email ?? "unknown",
    isAdmin: !!profile?.is_admin,
  };
}

// Gate for anything touching decrypted vault contents (list-own, reveal,
// create/edit/delete, share management), the RLS policies in
// migration-vault-sharing.sql enforce the same rule at the DB layer, this is
// the app-level copy so a locked vault gets a clear 423 instead of a vague
// empty-result-set from a silently-filtering RLS policy.
export async function requireVaultUnlocked(supabase: SupabaseServerClient, uid: string): Promise<void> {
  const { data } = await supabase
    .from(VAULT_PASSKEYS_TABLE)
    .select("unlocked_until")
    .eq("uid", uid)
    .maybeSingle();

  const unlockedUntil = data?.unlocked_until ? new Date(data.unlocked_until as string) : null;
  if (!unlockedUntil || unlockedUntil.getTime() <= Date.now()) {
    throw new ApiAuthError("Vault is locked, enter your passkey to continue", 423);
  }
}

// Resolves an employees.id to the auth uid of their linked login, if any.
// Sharing is keyed by uid (stable, tied to the actual session), not the
// employees table's own id. Returns null if that employee has no account
// yet (nothing to share with).
// Maps an employees row to the auth account that signed in as that person.
//
// user_profiles.employee_id looks like the obvious key but is null on every
// row in practice — the first-sign-in path inserts `employee_id: null` and
// nothing ever links it — so matching on it alone reports that a person has
// never signed in when they have. Fall back to their email, which is how
// lib/auth-context resolves the same pairing.
export async function resolveEmployeeUid(supabase: SupabaseServerClient, employeeId: string): Promise<string | null> {
  const { data: linked } = await supabase
    .from("user_profiles")
    .select("uid")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (linked?.uid) return linked.uid as string;

  const { data: employee } = await supabase
    .from("employees")
    .select("email")
    .eq("id", employeeId)
    .maybeSingle();
  const email = (employee?.email as string | undefined)?.trim();
  if (!email) return null;

  // Case-insensitive, and limit(1) rather than maybeSingle() so a duplicate
  // profile row resolves to one account instead of erroring the whole share.
  const { data: byEmail } = await supabase
    .from("user_profiles")
    .select("uid")
    .ilike("email", email)
    .limit(1);
  return (byEmail?.[0]?.uid as string) ?? null;
}

export async function getDisplayName(supabase: SupabaseServerClient, uid: string | null): Promise<string> {
  if (!uid) return "";
  const { data } = await supabase
    .from("user_profiles")
    .select("display_name, email")
    .eq("uid", uid)
    .maybeSingle();
  return (data?.display_name as string) || (data?.email as string) || "";
}
