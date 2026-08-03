import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ApiAuthError } from "@/lib/api-auth";
import { requireVaultSession, requireVaultUnlocked } from "@/lib/vault-auth";
import { VAULT_TABLE, VAULT_SHARES_TABLE, logVaultAudit } from "@/lib/vault-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; granteeUid: string }> }) {
  try {
    const supabase = await createClient();
    const actor = await requireVaultSession(supabase);
    const { id, granteeUid } = await params;

    const { data: entry, error: entryErr } = await supabase.from(VAULT_TABLE).select("id, name, owner_uid").eq("id", id).maybeSingle();
    if (entryErr) throw entryErr;
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isOwner = entry.owner_uid === actor.uid;
    if (!isOwner && !actor.isAdmin) return NextResponse.json({ error: "Only the owner can manage access" }, { status: 403 });
    if (isOwner) await requireVaultUnlocked(supabase, actor.uid);

    const { error } = await supabase
      .from(VAULT_SHARES_TABLE)
      .delete()
      .eq("entry_id", id)
      .eq("grantee_uid", granteeUid);
    if (error) throw error;

    await logVaultAudit(supabase, { action: "share_revoke", entryId: id, entryName: entry.name, actorUid: actor.uid, actorEmail: actor.email });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:shares:revoke]", err);
    return NextResponse.json({ error: "Failed to revoke access" }, { status: 500 });
  }
}
