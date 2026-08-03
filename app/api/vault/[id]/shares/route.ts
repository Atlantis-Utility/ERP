import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ApiAuthError } from "@/lib/api-auth";
import { requireVaultSession, requireVaultUnlocked, resolveEmployeeUid, getDisplayName } from "@/lib/vault-auth";
import { VAULT_TABLE, VAULT_SHARES_TABLE, logVaultAudit } from "@/lib/vault-server";
import type { VaultShareInfo } from "@/lib/vault-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Who has access to this entry, visible to the owner, an existing grantee
// (so a recipient can see who else it's shared with), or an admin. Anyone
// else gets the same 404 the entry itself would give them.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const actor = await requireVaultSession(supabase);
    const { id } = await params;

    if (!actor.isAdmin) await requireVaultUnlocked(supabase, actor.uid);

    const { data: entry, error: entryErr } = await supabase.from(VAULT_TABLE).select("id, owner_uid").eq("id", id).maybeSingle();
    if (entryErr) throw entryErr;
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: shares, error } = await supabase
      .from(VAULT_SHARES_TABLE)
      .select("grantee_uid, granted_by_uid, granted_at")
      .eq("entry_id", id)
      .order("granted_at");
    if (error) throw error;

    const uids = [...new Set((shares ?? []).flatMap((s) => [s.grantee_uid as string, s.granted_by_uid as string]))];
    const nameByUid = new Map<string, { name: string; email: string }>();
    if (uids.length > 0) {
      const { data: profiles } = await supabase.from("user_profiles").select("uid, display_name, email").in("uid", uids);
      for (const p of profiles ?? []) {
        nameByUid.set(p.uid as string, { name: (p.display_name as string) || (p.email as string) || "", email: p.email as string });
      }
    }

    const result: VaultShareInfo[] = (shares ?? []).map((s) => ({
      granteeUid: s.grantee_uid as string,
      granteeName: nameByUid.get(s.grantee_uid as string)?.name ?? "",
      granteeEmail: nameByUid.get(s.grantee_uid as string)?.email ?? "",
      grantedAt: s.granted_at as string,
      grantedByUid: s.granted_by_uid as string,
      grantedByName: nameByUid.get(s.granted_by_uid as string)?.name ?? "",
    }));

    return NextResponse.json({ shares: result, isOwner: entry.owner_uid === actor.uid });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:shares:list]", err);
    return NextResponse.json({ error: "Failed to load access list" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const actor = await requireVaultSession(supabase);
    const { id } = await params;
    const body = (await req.json()) as { employeeId?: string };
    if (!body.employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });

    const { data: entry, error: entryErr } = await supabase.from(VAULT_TABLE).select("id, name, owner_uid").eq("id", id).maybeSingle();
    if (entryErr) throw entryErr;
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isOwner = entry.owner_uid === actor.uid;
    if (!isOwner && !actor.isAdmin) return NextResponse.json({ error: "Only the owner can manage access" }, { status: 403 });
    if (isOwner) await requireVaultUnlocked(supabase, actor.uid);

    const granteeUid = await resolveEmployeeUid(supabase, body.employeeId);
    if (!granteeUid) {
      return NextResponse.json({ error: "That employee hasn't signed in yet, they need an account before you can share access." }, { status: 400 });
    }
    if (granteeUid === entry.owner_uid) {
      return NextResponse.json({ error: "This person already owns the entry" }, { status: 400 });
    }

    const { error } = await supabase
      .from(VAULT_SHARES_TABLE)
      .insert({ entry_id: id, grantee_uid: granteeUid, granted_by_uid: actor.uid });
    // Unique violation = already shared with them, treat as a success, not an error.
    if (error && error.code !== "23505") throw error;

    await logVaultAudit(supabase, { action: "share_grant", entryId: id, entryName: entry.name, actorUid: actor.uid, actorEmail: actor.email });

    const granteeName = await getDisplayName(supabase, granteeUid);
    return NextResponse.json({ ok: true, granteeUid, granteeName }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:shares:grant]", err);
    return NextResponse.json({ error: "Failed to share entry" }, { status: 500 });
  }
}
