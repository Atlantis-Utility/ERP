import { NextResponse } from "next/server";
import { requireEmployee, ApiAuthError } from "@/lib/api-auth";
import { getConnection, disconnect, isDelegatedConfigured } from "@/lib/microsoft/delegated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Is the caller connected to Microsoft, and as whom? */
export async function GET() {
  try {
    const actor = await requireEmployee();
    const connection = await getConnection(actor.email);
    return NextResponse.json({
      configured: isDelegatedConfigured(),
      connected: Boolean(connection) && !connection?.brokenReason,
      connection,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    // A missing table is the normal state before the migration is applied,
    // and it means "not connected" rather than "broken".
    return NextResponse.json({ configured: isDelegatedConfigured(), connected: false, connection: null });
  }
}

/** Forget this person's connection. Their consent at Microsoft is separate. */
export async function DELETE() {
  try {
    const actor = await requireEmployee();
    await disconnect(actor.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? err.message : "Couldn't disconnect";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
