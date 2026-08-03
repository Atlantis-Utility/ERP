import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ApiAuthError } from "@/lib/api-auth";
import { requireVaultSession } from "@/lib/vault-auth";
import { verifyPasskey } from "@/lib/vault-crypto";
import { VAULT_PASSKEYS_TABLE, VAULT_AUDIT_TABLE } from "@/lib/vault-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNLOCK_MINUTES = 20;
const ATTEMPTS_BEFORE_LOCKOUT = 5;
const MAX_LOCKOUT_MINUTES = 30;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const actor = await requireVaultSession(supabase);
    const body = (await req.json()) as { passkey?: string };
    if (!body.passkey) return NextResponse.json({ error: "Passkey is required" }, { status: 400 });

    const { data: row } = await supabase
      .from(VAULT_PASSKEYS_TABLE)
      .select("passkey_hash, passkey_salt, failed_attempts, locked_until")
      .eq("uid", actor.uid)
      .maybeSingle();

    if (!row?.passkey_hash) {
      return NextResponse.json({ error: "No passkey set, create one first" }, { status: 400 });
    }

    const lockedUntil = row.locked_until ? new Date(row.locked_until as string) : null;
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      const minutesLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000);
      return NextResponse.json({ error: `Too many attempts, try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}` }, { status: 423 });
    }

    const valid = verifyPasskey(body.passkey, { hash: row.passkey_hash as string, salt: row.passkey_salt as string });

    if (!valid) {
      const attempts = ((row.failed_attempts as number) ?? 0) + 1;
      const overBy = attempts - ATTEMPTS_BEFORE_LOCKOUT;
      const newLockedUntil = overBy >= 0
        ? new Date(Date.now() + Math.min(2 ** overBy, MAX_LOCKOUT_MINUTES) * 60 * 1000).toISOString()
        : null;

      await supabase.from(VAULT_PASSKEYS_TABLE)
        .update({ failed_attempts: attempts, locked_until: newLockedUntil, updated_at: new Date().toISOString() })
        .eq("uid", actor.uid);
      await supabase.from(VAULT_AUDIT_TABLE).insert({
        action: "unlock_failed", entry_id: actor.uid, entry_name: "(vault passkey)",
        actor_uid: actor.uid, actor_email: actor.email,
      });

      return NextResponse.json({ error: "Incorrect passkey" }, { status: 401 });
    }

    const unlockedUntil = new Date(Date.now() + UNLOCK_MINUTES * 60 * 1000).toISOString();
    await supabase.from(VAULT_PASSKEYS_TABLE)
      .update({ failed_attempts: 0, locked_until: null, unlocked_until: unlockedUntil, updated_at: new Date().toISOString() })
      .eq("uid", actor.uid);
    await supabase.from(VAULT_AUDIT_TABLE).insert({
      action: "unlock", entry_id: actor.uid, entry_name: "(vault passkey)",
      actor_uid: actor.uid, actor_email: actor.email,
    });

    return NextResponse.json({ unlockedUntil });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:unlock]", err);
    return NextResponse.json({ error: "Failed to unlock vault" }, { status: 500 });
  }
}
