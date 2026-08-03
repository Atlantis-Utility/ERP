import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, ApiAuthError } from "@/lib/api-auth";
import { resolveEmployeeUid } from "@/lib/vault-auth";
import { VAULT_PASSKEYS_TABLE, VAULT_AUDIT_TABLE } from "@/lib/vault-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Last-resort recovery: an employee who can't even get through the
// Microsoft re-verification (lost that account entirely) needs an admin to
// clear their vault_passkeys row so they go through first-time setup again.
// Does not touch their vault_entries/vault_shares, only the unlock gate.
export async function POST(req: Request) {
  try {
    const actor = await requireAdmin();
    const supabase = await createClient();
    const body = (await req.json()) as { employeeId?: string };
    if (!body.employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });

    const targetUid = await resolveEmployeeUid(supabase, body.employeeId);
    if (!targetUid) return NextResponse.json({ error: "That employee has no account" }, { status: 404 });

    const { error } = await supabase.from(VAULT_PASSKEYS_TABLE).delete().eq("uid", targetUid);
    if (error) throw error;

    await supabase.from(VAULT_AUDIT_TABLE).insert({
      action: "passkey_reset", entry_id: targetUid, entry_name: "(vault passkey)",
      actor_uid: actor.uid, actor_email: actor.email,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:passkey:admin-reset]", err);
    return NextResponse.json({ error: "Failed to reset passkey" }, { status: 500 });
  }
}
