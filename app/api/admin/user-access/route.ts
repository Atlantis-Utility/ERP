import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin, ApiAuthError } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Grants or revokes admin access on a user_profiles row.
 *
 * It used to be written straight from the Settings page with the caller's
 * own session. The table's policy allows anyone to update their own row, so
 * that made admin something a person could give themselves with one request
 * — the hidden button was the only thing stopping them. It goes through
 * here now, where being an administrator is checked first and the write
 * happens with the service key.
 */
export async function POST(req: Request) {
  try {
    const actor = await requireAdmin();
    const { uid, isAdmin } = (await req.json()) as { uid?: string; isAdmin?: boolean };
    if (!uid || typeof isAdmin !== "boolean") {
      return NextResponse.json({ error: "Which user, and to what?" }, { status: 400 });
    }
    // Losing your own access by accident leaves nobody able to give it
    // back; the UI already refuses, and so does this.
    if (uid === actor.uid) {
      return NextResponse.json({ error: "You can't change your own access." }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("user_profiles").update({ is_admin: isAdmin }).eq("uid", uid);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[admin:user-access]", err);
    return NextResponse.json({ error: "Couldn't update access" }, { status: 500 });
  }
}
