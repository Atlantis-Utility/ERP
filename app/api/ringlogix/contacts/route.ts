import { NextRequest, NextResponse } from "next/server";
import { getContacts, createContact, deleteContact, isConfigured } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { requireEmployee, ApiAuthError } from "@/lib/api-auth";

/**
 * These three had no guard on them at all: anybody who could reach the
 * app could read, create and delete entries in the company's contact
 * book without signing in. Every other RingLogix write checks first.
 */
function refuse(err: unknown) {
  if (err instanceof ApiAuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return ringlogixFailure(err);
}

export async function GET(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const p = req.nextUrl.searchParams;
  const domain = p.get("domain") ?? "";
  const user   = p.get("user") ?? "";
  try {
    await requireEmployee();
    const data = await getContacts(domain, user, {
      first_name: p.get("first_name") ?? undefined,
      last_name:  p.get("last_name")  ?? undefined,
      limit:      p.get("limit")      ?? undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    return refuse(err);
  }
}

export async function POST(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    await requireEmployee();
    const body = await req.json();
    const data = await createContact(body.domain, body.user, body.first_name, body.last_name, {
      company: body.company, work_phone: body.work_phone,
      cell_phone: body.cell_phone, home_phone: body.home_phone, email: body.email,
    });
    return NextResponse.json(data);
  } catch (err) {
    return refuse(err);
  }
}

export async function DELETE(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    await requireEmployee();
    const body = await req.json();
    const data = await deleteContact(body.domain, body.user, body.first_name, body.last_name, body.contact_id);
    return NextResponse.json(data);
  } catch (err) {
    return refuse(err);
  }
}
