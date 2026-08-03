import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ApiAuthError } from "@/lib/api-auth";
import { requireVaultSession } from "@/lib/vault-auth";
import { VAULT_PASSKEYS_TABLE } from "@/lib/vault-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Explicit "Lock Vault" action, expires the unlock immediately rather than
// waiting for it to time out on its own.
export async function POST() {
  try {
    const supabase = await createClient();
    const actor = await requireVaultSession(supabase);

    const { error } = await supabase
      .from(VAULT_PASSKEYS_TABLE)
      .update({ unlocked_until: null, updated_at: new Date().toISOString() })
      .eq("uid", actor.uid);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:lock]", err);
    return NextResponse.json({ error: "Failed to lock vault" }, { status: 500 });
  }
}
