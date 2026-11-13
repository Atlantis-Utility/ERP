import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin, ApiAuthError } from "@/lib/api-auth";
import { isPageOption } from "@/lib/page-options";

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
    const body = (await req.json()) as {
      access?: string[];
      accessRole?: string;
      dashboard?: string[];
      pageOptions?: string[];
    };

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
      // Which dashboard panels they see; the same kind of grant as a page,
      // so it goes through the same admin-only route.
      ...(body.dashboard !== undefined ? { dashboard: body.dashboard } : {}),
      // Grants inside a page (lib/page-options.ts), e.g. whether Customers
      // shows money. Filtered to keys we actually define: this list is read
      // back as a permission, so a typo or an invented key stored here would
      // sit in the row forever looking like a grant.
      ...(body.pageOptions !== undefined
        ? { pageOptions: body.pageOptions.filter(isPageOption) }
        : {}),
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
