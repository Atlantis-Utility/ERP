import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/vault-crypto";
import { VAULT_TABLE, VAULT_EXTERNAL_SHARES_TABLE, logVaultAudit } from "@/lib/vault-server";
import { hashShareToken, isPlausibleShareToken, externalShareStatus, viewsLeft } from "@/lib/vault-external";
import type { VaultSharedCredentials, VaultSharedLinkPreview } from "@/lib/vault-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, unauthenticated: the token is the credential, as with
// app/api/feedback/[token]. Read with the service key because the person
// holding the link has no session for RLS to judge.

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

async function findShare(token: string) {
  if (!isPlausibleShareToken(token)) return null;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from(VAULT_EXTERNAL_SHARES_TABLE)
    .select("*")
    .eq("token_hash", hashShareToken(token))
    .maybeSingle();
  if (error) throw error;
  return data ? { supabase, share: data } : null;
}

async function senderNameOf(supabase: ReturnType<typeof createServiceRoleClient>, uid: string): Promise<string> {
  const { data } = await supabase.from("user_profiles").select("display_name, email").eq("uid", uid).maybeSingle();
  return (data?.display_name as string) || (data?.email as string) || "Atlantis Utility";
}

/**
 * What the link is, without opening it. Mail scanners (Outlook Safe Links,
 * Gmail's) fetch links before the person ever clicks, so loading the page
 * must not count as a view; only the explicit reveal below does.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const found = await findShare(token);
    if (!found) return json({ error: "not_found" }, 404);
    const { supabase, share } = found;

    const status = externalShareStatus(share);
    const senderName = await senderNameOf(supabase, share.created_by_uid as string);
    if (status !== "active") {
      const body: VaultSharedLinkPreview = { status, senderName };
      return json(body, 410);
    }

    const { data: entry } = await supabase.from(VAULT_TABLE).select("name").eq("id", share.entry_id).maybeSingle();
    if (!entry) return json({ error: "not_found" }, 404);

    const body: VaultSharedLinkPreview = {
      status: "active",
      entryName: entry.name as string,
      senderName,
      recipientEmail: share.recipient_email as string,
      message: (share.message as string) ?? undefined,
      expiresAt: share.expires_at as string,
      viewsLeft: viewsLeft(share),
    };
    return json(body);
  } catch (err) {
    console.error("[shared:preview]", err);
    return json({ error: "failed" }, 500);
  }
}

/** Shows the credential, and counts it against the link's view limit. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const found = await findShare(token);
    if (!found) return json({ error: "not_found" }, 404);
    const { supabase } = found;
    let share = found.share;

    // Claim a view with a compare-and-set on view_count, so two tabs opening
    // a one-time link at the same moment can't both get it. Retried a
    // couple of times for links without a limit, where a race is harmless.
    for (let attempt = 0; ; attempt++) {
      const status = externalShareStatus(share);
      if (status !== "active") {
        return json({ status, senderName: await senderNameOf(supabase, share.created_by_uid as string) }, 410);
      }
      const { data: claimed, error } = await supabase
        .from(VAULT_EXTERNAL_SHARES_TABLE)
        .update({ view_count: (share.view_count as number) + 1, last_viewed_at: new Date().toISOString() })
        .eq("id", share.id)
        .eq("view_count", share.view_count)
        .is("revoked_at", null)
        .select("*");
      if (error) throw error;
      if (claimed && claimed.length > 0) {
        share = claimed[0];
        break;
      }
      if (attempt >= 2) return json({ error: "busy" }, 409);
      const { data: fresh } = await supabase.from(VAULT_EXTERNAL_SHARES_TABLE).select("*").eq("id", share.id).maybeSingle();
      if (!fresh) return json({ error: "not_found" }, 404);
      share = fresh;
    }

    const { data: entry, error: entryErr } = await supabase.from(VAULT_TABLE).select("*").eq("id", share.entry_id).maybeSingle();
    if (entryErr) throw entryErr;
    if (!entry) return json({ error: "not_found" }, 404);

    const body: VaultSharedCredentials = {
      entryName: entry.name as string,
      accountId: (entry.account_id as string) || undefined,
      email: (entry.email as string) || undefined,
      website: (entry.website as string) || undefined,
      password: decryptSecret({ ciphertext: entry.ciphertext, iv: entry.iv, authTag: entry.auth_tag }),
      pin: entry.pin_ciphertext
        ? decryptSecret({ ciphertext: entry.pin_ciphertext, iv: entry.pin_iv, authTag: entry.pin_auth_tag })
        : undefined,
      notes: share.include_notes ? (entry.notes as string) || undefined : undefined,
      expiresAt: share.expires_at as string,
      viewsLeft: viewsLeft(share),
    };

    // The audit log wants an account for the actor and the viewer has none;
    // it's filed under the sender, with the recipient named, so the entry's
    // history reads "opened by <them> through <sender>'s link".
    await logVaultAudit(supabase, {
      action: "external_view",
      entryId: entry.id as string,
      entryName: entry.name as string,
      actorUid: share.created_by_uid as string,
      actorEmail: `${share.recipient_email} (outside link)`,
    });

    return json(body);
  } catch (err) {
    console.error("[shared:reveal]", err);
    return json({ error: "failed" }, 500);
  }
}
