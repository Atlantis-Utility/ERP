import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ApiAuthError } from "@/lib/api-auth";
import { requireVaultSession, requireVaultUnlocked } from "@/lib/vault-auth";
import { VAULT_TABLE, VAULT_EXTERNAL_SHARES_TABLE, logVaultAudit } from "@/lib/vault-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stops an outside link working, now. Kept as a row with revoked_at rather
// than deleted, so the owner can still see who was sent what and when.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; shareId: string }> }) {
  try {
    const supabase = await createClient();
    const actor = await requireVaultSession(supabase);
    const { id, shareId } = await params;

    const { data: entry, error: entryErr } = await supabase.from(VAULT_TABLE).select("id, name, owner_uid").eq("id", id).maybeSingle();
    if (entryErr) throw entryErr;
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const isOwner = entry.owner_uid === actor.uid;
    if (!isOwner && !actor.isAdmin) return NextResponse.json({ error: "Only the owner can revoke outside links" }, { status: 403 });
    if (isOwner) await requireVaultUnlocked(supabase, actor.uid);

    const { data: revoked, error } = await supabase
      .from(VAULT_EXTERNAL_SHARES_TABLE)
      .update({ revoked_at: new Date().toISOString(), revoked_by_uid: actor.uid })
      .eq("id", shareId)
      .eq("entry_id", id)
      .is("revoked_at", null)
      .select("recipient_email");
    if (error) throw error;

    if (revoked && revoked.length > 0) {
      await logVaultAudit(supabase, {
        action: "external_revoke",
        entryId: id,
        entryName: `${entry.name} → ${revoked[0].recipient_email}`,
        actorUid: actor.uid,
        actorEmail: actor.email,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:external:revoke]", err);
    return NextResponse.json({ error: "Failed to revoke link" }, { status: 500 });
  }
}
