import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ApiAuthError } from "@/lib/api-auth";
import { requireVaultSession, requireVaultUnlocked } from "@/lib/vault-auth";
import { encryptSecret } from "@/lib/vault-crypto";
import { VAULT_TABLE, VAULT_SHARES_TABLE, toVaultMeta, logVaultAudit } from "@/lib/vault-server";
import type { VaultEntryInput, VaultEntryMeta } from "@/lib/vault-types";
import type { VaultActor } from "@/lib/vault-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Attaches per-caller fields (ownership, display name, share count) that
// aren't stored on the row itself, one batch of lookups for the whole
// list rather than a query per entry.
async function enrichEntries(
  supabase: SupabaseServerClient,
  rows: Record<string, unknown>[],
  actor: VaultActor
): Promise<VaultEntryMeta[]> {
  const metas = rows.map(toVaultMeta);

  const ownerUids = [...new Set(metas.map((m) => m.ownerUid).filter((u): u is string => !!u && u !== actor.uid))];
  const nameByUid = new Map<string, string>();
  if (ownerUids.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("uid, display_name, email")
      .in("uid", ownerUids);
    for (const p of profiles ?? []) {
      nameByUid.set(p.uid as string, (p.display_name as string) || (p.email as string) || "");
    }
  }

  const entryIds = metas.map((m) => m.id);
  const shareCounts = new Map<string, number>();
  if (entryIds.length > 0) {
    const { data: shares } = await supabase
      .from(VAULT_SHARES_TABLE)
      .select("entry_id")
      .in("entry_id", entryIds);
    for (const s of shares ?? []) {
      const id = s.entry_id as string;
      shareCounts.set(id, (shareCounts.get(id) ?? 0) + 1);
    }
  }

  return metas.map((m) => {
    const isOwner = m.ownerUid === actor.uid;
    return {
      ...m,
      isOwner,
      isAdminView: actor.isAdmin && !isOwner,
      ownerName: isOwner ? "You" : (m.ownerUid ? nameByUid.get(m.ownerUid) ?? "" : ""),
      shareCount: shareCounts.get(m.id) ?? 0,
    };
  });
}

export async function GET() {
  try {
    const supabase = await createClient();
    const actor = await requireVaultSession(supabase);

    // Admins see everything (recovery/offboarding override) without needing
    // their own vault unlocked, everyone else only sees what RLS returns
    // for their uid (owned + shared-with-them), and only once unlocked.
    if (!actor.isAdmin) await requireVaultUnlocked(supabase, actor.uid);

    const { data, error } = await supabase.from(VAULT_TABLE).select("*").order("name");
    if (error) throw error;

    const entries = await enrichEntries(supabase, data ?? [], actor);
    return NextResponse.json({ entries });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:list]", err);
    return NextResponse.json({ error: "Failed to load vault" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const actor = await requireVaultSession(supabase);
    await requireVaultUnlocked(supabase, actor.uid);

    const body = (await req.json()) as VaultEntryInput;
    if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!body.password) return NextResponse.json({ error: "Password is required" }, { status: 400 });

    const secret = encryptSecret(body.password);
    const pinSecret = body.pin ? encryptSecret(body.pin) : null;
    const { data: inserted, error } = await supabase
      .from(VAULT_TABLE)
      .insert({
        name: body.name.trim(),
        account_id: body.accountId?.trim() || null,
        email: body.email?.trim() || null,
        website: body.website?.trim() || null,
        phone_numbers: (body.phoneNumbers ?? []).map((p) => p.trim()).filter(Boolean),
        points_of_contact: (body.pointsOfContact ?? []).map((p) => p.trim()).filter(Boolean),
        category: body.category || "other",
        notes: body.notes?.trim() || null,
        tags: Array.isArray(body.tags) ? body.tags : [],
        ciphertext: secret.ciphertext,
        iv: secret.iv,
        auth_tag: secret.authTag,
        pin_ciphertext: pinSecret?.ciphertext ?? null,
        pin_iv: pinSecret?.iv ?? null,
        pin_auth_tag: pinSecret?.authTag ?? null,
        customer_id: body.customerId?.trim() || null,
        customer_name: body.customerName?.trim() || null,
        created_by: actor.email,
        updated_by: actor.email,
        owner_uid: actor.uid,
      })
      .select("*")
      .single();
    if (error) throw error;

    await logVaultAudit(supabase, { action: "create", entryId: inserted.id, entryName: inserted.name, actorUid: actor.uid, actorEmail: actor.email });
    const meta = toVaultMeta(inserted);
    return NextResponse.json({
      entry: { ...meta, isOwner: true, isAdminView: false, ownerName: "You", shareCount: 0 },
    }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:create]", err);
    return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
  }
}
