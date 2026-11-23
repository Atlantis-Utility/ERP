import { NextRequest, NextResponse } from "next/server";
import { getDialRules, createDialRule, isConfigured } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { denyUnlessEmployee } from "@/lib/ringlogix-guard";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessEmployee();
  if (denied) return denied;

  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const p = req.nextUrl.searchParams;
  const domain   = p.get("domain")   ?? "";
  const dialplan = p.get("dialplan") ?? "";
  try {
    const data = await getDialRules(domain, dialplan);
    return NextResponse.json(data);
  } catch (err) {
    return ringlogixFailure(err);
  }
}

export async function POST(req: NextRequest) {
  const denied = await denyUnlessEmployee();
  if (denied) return denied;

  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    const body = await req.json();
    const data = await createDialRule(body.domain, body.dialplan, body.matchrule, body.to_user);
    return NextResponse.json(data);
  } catch (err) {
    return ringlogixFailure(err);
  }
}
