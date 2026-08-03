import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ApiAuthError } from "@/lib/api-auth";
import { requireVaultSession, requireVaultUnlocked } from "@/lib/vault-auth";
import { decryptSecret } from "@/lib/vault-crypto";
import { VAULT_TABLE, logVaultAudit } from "@/lib/vault-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The only endpoint that ever returns a plaintext password. Requires an
// explicit user action (never called automatically or in bulk), and every
// call is written to the vault audit log.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const actor = await requireVaultSession(supabase);
    const { id } = await params;

    // Owner or grantee: their OWN vault must be unlocked to reveal anything,
    // whether it's an entry they own or one shared with them. Admins get a
    // recovery/offboarding override and skip this, checked before the
    // fetch so a locked owner gets a clear 423 instead of a confusing 404
    // (RLS would otherwise just filter the row out silently).
    if (!actor.isAdmin) await requireVaultUnlocked(supabase, actor.uid);

    const { data: entry, error: fetchErr } = await supabase.from(VAULT_TABLE).select("*").eq("id", id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const password = decryptSecret({ ciphertext: entry.ciphertext, iv: entry.iv, authTag: entry.auth_tag });
    const pin = entry.pin_ciphertext
      ? decryptSecret({ ciphertext: entry.pin_ciphertext, iv: entry.pin_iv, authTag: entry.pin_auth_tag })
      : null;

    const revealedAt = new Date().toISOString();
    await supabase.from(VAULT_TABLE).update({ last_revealed_at: revealedAt, last_revealed_by: actor.email }).eq("id", id);
    await logVaultAudit(supabase, { action: "reveal", entryId: id, entryName: entry.name, actorUid: actor.uid, actorEmail: actor.email });

    return NextResponse.json({ password, pin, revealedAt });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:reveal]", err);
    return NextResponse.json({ error: "Failed to reveal password" }, { status: 500 });
  }
}
