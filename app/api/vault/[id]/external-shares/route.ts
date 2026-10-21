import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ApiAuthError } from "@/lib/api-auth";
import { requireVaultSession, requireVaultUnlocked, getDisplayName } from "@/lib/vault-auth";
import { VAULT_TABLE, VAULT_EXTERNAL_SHARES_TABLE, logVaultAudit } from "@/lib/vault-server";
import { newShareToken, toExternalShareInfo, formatExpiry, VAULT_SHARE_EVENTS_TABLE } from "@/lib/vault-external";
import { buildVaultExternalShareEmail } from "@/lib/email/vault-external-share-email";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { appOrigin } from "@/lib/app-origin";
import { VAULT_EXTERNAL_MAX_DAYS, type VaultExternalShareInput } from "@/lib/vault-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A minute, not five: a "5 min" link is timed from the click in the
// browser, so it lands here a little under five minutes out.
const MIN_LIFETIME_MS = 60_000;

// Owner (vault unlocked) or admin. Anyone else gets the 404 the entry
// itself would give them, and grantees in particular can't hand a
// credential they were lent to somebody outside.
async function loadManageableEntry(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const actor = await requireVaultSession(supabase);
  const { data: entry, error } = await supabase.from(VAULT_TABLE).select("id, name, owner_uid").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!entry) throw new ApiAuthError("Not found", 404);
  const isOwner = entry.owner_uid === actor.uid;
  if (!isOwner && !actor.isAdmin) throw new ApiAuthError("Only the owner can share this outside the organization", 403);
  if (isOwner) await requireVaultUnlocked(supabase, actor.uid);
  return { actor, entry };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    await loadManageableEntry(supabase, id);

    const { data: rows, error } = await supabase
      .from(VAULT_EXTERNAL_SHARES_TABLE)
      .select("*")
      .eq("entry_id", id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const creatorUids = [...new Set((rows ?? []).map((r) => r.created_by_uid as string))];
    const names = new Map<string, string>();
    if (creatorUids.length > 0) {
      const { data: profiles } = await supabase.from("user_profiles").select("uid, display_name, email").in("uid", creatorUids);
      for (const p of profiles ?? []) names.set(p.uid as string, (p.display_name as string) || (p.email as string) || "");
    }

    // Every event for these links in one query, grouped per link. Under the
    // caller's session: RLS lets the owner (unlocked) or an admin read them.
    const eventsByShare = new Map<string, Record<string, unknown>[]>();
    const shareIds = (rows ?? []).map((r) => r.id as string);
    if (shareIds.length > 0) {
      const { data: events, error: eventsErr } = await supabase
        .from(VAULT_SHARE_EVENTS_TABLE)
        .select("share_id, kind, at, user_agent")
        .in("share_id", shareIds)
        .order("at");
      // Tracking is extra: a missing table (migration not run yet) shows
      // links without their history rather than no links at all.
      if (eventsErr) console.error("[vault:external:events]", eventsErr);
      for (const e of events ?? []) {
        const list = eventsByShare.get(e.share_id as string) ?? [];
        list.push(e);
        eventsByShare.set(e.share_id as string, list);
      }
    }

    return NextResponse.json({
      shares: (rows ?? []).map((r) =>
        toExternalShareInfo(r, names.get(r.created_by_uid as string) ?? "", eventsByShare.get(r.id as string)),
      ),
      emailConfigured: isEmailConfigured(),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:external:list]", err);
    return NextResponse.json({ error: "Failed to load outside links" }, { status: 500 });
  }
}

/**
 * Makes the link and emails it. The token is returned once, here, so the
 * sender can copy it if the mail is slow or lands in junk; after this only
 * its hash exists.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const { actor, entry } = await loadManageableEntry(supabase, id);
    const body = (await req.json().catch(() => ({}))) as Partial<VaultExternalShareInput>;

    const recipientEmail = (body.recipientEmail ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(recipientEmail)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });

    const expiresAt = new Date(body.expiresAt ?? "");
    const lifetime = expiresAt.getTime() - Date.now();
    if (Number.isNaN(lifetime) || lifetime < MIN_LIFETIME_MS) {
      return NextResponse.json({ error: "Pick an expiry at least a minute from now" }, { status: 400 });
    }
    if (lifetime > VAULT_EXTERNAL_MAX_DAYS * 86_400_000 + 60_000) {
      return NextResponse.json({ error: `A link can last at most ${VAULT_EXTERNAL_MAX_DAYS} days` }, { status: 400 });
    }

    const maxViews = body.maxViews ?? null;
    if (maxViews !== null && (!Number.isInteger(maxViews) || maxViews < 1 || maxViews > 100)) {
      return NextResponse.json({ error: "View limit must be between 1 and 100" }, { status: 400 });
    }

    if (!isEmailConfigured()) {
      return NextResponse.json({ error: "Email isn't set up on this server, so the link can't be sent" }, { status: 503 });
    }

    const recipientName = body.recipientName?.trim().slice(0, 120) || null;
    const message = body.message?.trim().slice(0, 1000) || null;
    const { token, hash } = newShareToken();

    const base = {
      entry_id: id,
      token_hash: hash,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      message,
      include_notes: !!body.includeNotes,
      expires_at: expiresAt.toISOString(),
      max_views: maxViews,
      created_by_uid: actor.uid,
    };
    let { data: row, error } = await supabase
      .from(VAULT_EXTERNAL_SHARES_TABLE)
      .insert({ ...base, notify_owner: body.notifyOwner !== false, sender_time_zone: body.timeZone?.slice(0, 64) ?? null })
      .select("*")
      .single();
    // PGRST204: no such column. The tracking migration hasn't been run yet;
    // sharing still works, just without the "email me" option.
    if (error?.code === "PGRST204") {
      ({ data: row, error } = await supabase.from(VAULT_EXTERNAL_SHARES_TABLE).insert(base).select("*").single());
    }
    if (error || !row) throw error ?? new Error("insert returned no row");

    const senderName = (await getDisplayName(supabase, actor.uid)) || actor.email;
    const url = `${appOrigin(req)}/shared/${token}`;
    const { subject, html } = buildVaultExternalShareEmail({
      entryName: entry.name as string,
      recipientName,
      senderName,
      senderEmail: actor.email,
      message,
      url,
      // Loaded when the email is displayed, which is how "email opened" is
      // known. Same token as the link: the email already carries it.
      trackingPixelUrl: `${appOrigin(req)}/api/shared/${token}/open`,
      expiresLabel: formatExpiry(expiresAt.toISOString(), body.timeZone),
      maxViews,
    });

    try {
      await sendEmail({ to: recipientEmail, subject, html, replyTo: actor.email });
    } catch (mailErr) {
      // A link nobody was told about is worse than none: take it back, so
      // the list doesn't claim something was sent.
      console.error("[vault:external:email]", mailErr);
      await supabase.from(VAULT_EXTERNAL_SHARES_TABLE).delete().eq("id", row.id);
      return NextResponse.json({ error: "The email couldn't be sent, so no link was created. Try again." }, { status: 502 });
    }

    await logVaultAudit(supabase, {
      action: "external_share",
      entryId: id,
      entryName: `${entry.name} → ${recipientEmail}`,
      actorUid: actor.uid,
      actorEmail: actor.email,
    });

    return NextResponse.json({ share: toExternalShareInfo(row, senderName), url }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[vault:external:create]", err);
    return NextResponse.json({ error: "Failed to share outside the organization" }, { status: 500 });
  }
}
