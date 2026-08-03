import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ApiAuthError } from "@/lib/api-auth";
import { requireVaultSession, requireVaultUnlocked } from "@/lib/vault-auth";
import { encryptSecret } from "@/lib/vault-crypto";
import { VAULT_TABLE, toVaultMeta, logVaultAudit } from "@/lib/vault-server";
import type { VaultEntryUpdateInput } from "@/lib/vault-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const actor = await requireVaultSession(supabase);
    const { id } = await params;
    const body = (await req.json()) as VaultEntryUpdateInput;

    const { data: existing, error: fetchErr } = await supabase.from(VAULT_TABLE).select("*").eq("id", id).maybeSingle();
    if (fetchErr) throw fetchErr;
    // Not found covers both "doesn't exist" and "exists but I have no access
    // to it" (a grantee, say), one response either way avoids confirming
    // an entry's existence to someone who shouldn't know about it.
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isOwner = existing.owner_uid === actor.uid;
    if (!isOwner && !actor.isAdmin) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Editing is owner-or-admin only, a grantee's read/reveal access never
    // extends to changing the entry. Unlock is required for the owner's own
    // vault; an admin editing someone else's entry is an explicit override
    // and doesn't need that owner's passkey.
    if (isOwner) await requireVaultUnlocked(supabase, actor.uid);

    const patch: Record<string, unknown> = { updated_by: actor.email };
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.accountId !== undefined) patch.account_id = body.accountId?.trim() || null;
    if (body.email !== undefined) patch.email = body.email?.trim() || null;
    if (body.website !== undefined) patch.website = body.website?.trim() || null;
    if (body.phoneNumbers !== undefined) patch.phone_numbers = body.phoneNumbers.map((p) => p.trim()).filter(Boolean);
    if (body.pointsOfContact !== undefined) patch.points_of_contact = body.pointsOfContact.map((p) => p.trim()).filter(Boolean);
    if (body.category !== undefined) patch.category = body.category;
    if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;
    if (body.tags !== undefined) patch.tags = body.tags;
    if (body.customerId !== undefined) patch.customer_id = body.customerId?.trim() || null;
    if (body.customerName !== undefined) patch.customer_name = body.customerName?.trim() || null;
    if (body.password) {
      const secret = encryptSecret(body.password);
      patch.ciphertext = secret.ciphertext;
      patch.iv = secret.iv;
      patch.auth_tag = secret.authTag;
    }
    if (body.clearPin) {
      patch.pin_ciphertext = null;
      patch.pin_iv = null;
      patch.pin_auth_tag = null;
    } else if (body.pin) {
      const pinSecret = encryptSecret(body.pin);
      patch.pin_ciphertext = pinSecret.ciphertext;
      patch.pin_iv = pinSecret.iv;
      patch.pin_auth_tag = pinSecret.authTag;
    }

    const { data: updated, error } = await supabase.from(VAULT_TABLE).update(patch).eq("id", id).select("*").single();
    if (error) throw error;

    await logVaultAudit(supabase, { action: "update", entryId: id, entryName: updated.name, actorUid: actor.uid, actorEmail: actor.email });
    const meta = toVaultMeta(updated);
    return NextResponse.json({ entry: { ...meta, isOwner, isAdminView: actor.isAdmin && !isOwner, ownerName: isOwner ? "You" : "" } });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:update]", err);
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const actor = await requireVaultSession(supabase);
    const { id } = await params;

    const { data: existing, error: fetchErr } = await supabase.from(VAULT_TABLE).select("name, owner_uid").eq("id", id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isOwner = existing.owner_uid === actor.uid;
    if (!isOwner && !actor.isAdmin) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (isOwner) await requireVaultUnlocked(supabase, actor.uid);

    const { error } = await supabase.from(VAULT_TABLE).delete().eq("id", id);
    if (error) throw error;

    await logVaultAudit(supabase, { action: "delete", entryId: id, entryName: existing.name, actorUid: actor.uid, actorEmail: actor.email });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:delete]", err);
    return NextResponse.json({ error: "Failed to delete entry" }, { status: 500 });
  }
}
