import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin, ApiAuthError } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Page access and access-role are permission grants, not ordinary profile
// fields — the employees table's RLS otherwise lets any authenticated user
// write any row, so this has to be admin-gated server-side. Hiding the
// controls in the UI alone wouldn't stop someone from editing the request
// directly and granting themselves every page.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await req.json()) as { access?: string[]; accessRole?: string };

    const supabase = createServiceRoleClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("employees")
      .select("data")
      .eq("id", id)
      .single();
    if (fetchErr) throw fetchErr;

    const merged = {
      ...(existing.data as Record<string, unknown>),
      ...(body.access !== undefined ? { access: body.access } : {}),
      ...(body.accessRole !== undefined ? { accessRole: body.accessRole } : {}),
    };

    const { error } = await supabase.from("employees").update({ data: merged }).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[employees:access]", err);
    return NextResponse.json({ error: "Failed to update access" }, { status: 500 });
  }
}
