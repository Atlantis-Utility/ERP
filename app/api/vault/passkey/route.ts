import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ApiAuthError } from "@/lib/api-auth";
import { requireVaultSession } from "@/lib/vault-auth";
import { hashPasskey, verifyPasskey } from "@/lib/vault-crypto";
import { VAULT_PASSKEYS_TABLE, VAULT_AUDIT_TABLE } from "@/lib/vault-server";
import type { VaultPasskeyStatus } from "@/lib/vault-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNLOCK_MINUTES = 20;
const MIN_PASSKEY_LENGTH = 6;

function isFuture(iso: string | null | undefined): boolean {
  return !!iso && new Date(iso).getTime() > Date.now();
}

export async function GET() {
  try {
    const supabase = await createClient();
    const actor = await requireVaultSession(supabase);

    const { data } = await supabase
      .from(VAULT_PASSKEYS_TABLE)
      .select("passkey_hash, unlocked_until, locked_until, ms_verified_until")
      .eq("uid", actor.uid)
      .maybeSingle();

    const status: VaultPasskeyStatus = {
      hasPasskey: !!data?.passkey_hash,
      isUnlocked: isFuture(data?.unlocked_until as string | null),
      unlockedUntil: (data?.unlocked_until as string) ?? undefined,
      lockedUntil: isFuture(data?.locked_until as string | null) ? (data!.locked_until as string) : undefined,
      msVerified: isFuture(data?.ms_verified_until as string | null),
    };
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:passkey:status]", err);
    return NextResponse.json({ error: "Failed to load passkey status" }, { status: 500 });
  }
}

// Handles first-time setup, a normal change (knows the current passkey), and
// the "forgot passkey" reset (proved via a fresh Microsoft re-verification
// instead), whichever proof is present and valid is accepted.
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const actor = await requireVaultSession(supabase);
    const body = (await req.json()) as { newPasskey?: string; currentPasskey?: string };

    if (!body.newPasskey || body.newPasskey.length < MIN_PASSKEY_LENGTH) {
      return NextResponse.json({ error: `Passkey must be at least ${MIN_PASSKEY_LENGTH} characters` }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from(VAULT_PASSKEYS_TABLE)
      .select("passkey_hash, passkey_salt, ms_verified_until")
      .eq("uid", actor.uid)
      .maybeSingle();

    const msVerified = isFuture(existing?.ms_verified_until as string | null);

    if (existing?.passkey_hash) {
      // Changing an existing passkey: either they know the current one, or
      // they just proved identity via Microsoft (forgot-passkey path).
      const currentValid = !!body.currentPasskey && verifyPasskey(body.currentPasskey, {
        hash: existing.passkey_hash as string,
        salt: existing.passkey_salt as string,
      });
      if (!currentValid && !msVerified) {
        return NextResponse.json({ error: "Current passkey is incorrect" }, { status: 401 });
      }
    } else if (!msVerified) {
      // First-time setup always requires the fresh Microsoft check.
      return NextResponse.json({ error: "Please verify your Microsoft account first" }, { status: 401 });
    }

    const { hash, salt } = hashPasskey(body.newPasskey);
    const nowIso = new Date().toISOString();
    const unlockedUntil = new Date(Date.now() + UNLOCK_MINUTES * 60 * 1000).toISOString();

    const { error } = await supabase.from(VAULT_PASSKEYS_TABLE).upsert({
      uid: actor.uid,
      passkey_hash: hash,
      passkey_salt: salt,
      failed_attempts: 0,
      locked_until: null,
      ms_verified_until: null, // single-use
      unlocked_until: unlockedUntil,
      updated_at: nowIso,
    }, { onConflict: "uid" });
    if (error) throw error;

    await supabase.from(VAULT_AUDIT_TABLE).insert({
      action: "passkey_set",
      entry_id: actor.uid,
      entry_name: "(vault passkey)",
      actor_uid: actor.uid,
      actor_email: actor.email,
    });

    return NextResponse.json({ ok: true, unlockedUntil });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:passkey:set]", err);
    return NextResponse.json({ error: "Failed to set passkey" }, { status: 500 });
  }
}
