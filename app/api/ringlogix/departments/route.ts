import { NextRequest, NextResponse } from "next/server";
import { getDepartments, isConfigured } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { denyUnlessEmployee } from "@/lib/ringlogix-guard";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessEmployee();
  if (denied) return denied;

  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const domain = req.nextUrl.searchParams.get("domain") ?? "";
  try {
    const data = await getDepartments(domain);
    return NextResponse.json(data);
  } catch (err) {
    return ringlogixFailure(err);
  }
}
