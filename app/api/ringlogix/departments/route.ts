import { NextRequest, NextResponse } from "next/server";
import { getDepartments, isConfigured } from "@/lib/ringlogix";

export async function GET(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const domain = req.nextUrl.searchParams.get("domain") ?? "";
  try {
    const data = await getDepartments(domain);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
