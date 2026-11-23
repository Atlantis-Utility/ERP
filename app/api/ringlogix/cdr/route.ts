import { NextRequest, NextResponse } from "next/server";
import { getCDRs, isConfigured } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { denyUnlessEmployee } from "@/lib/ringlogix-guard";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessEmployee();
  if (denied) return denied;

  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const { searchParams } = req.nextUrl;
  try {
    const data = await getCDRs({
      domain: searchParams.get("domain") ?? undefined,
      limit: searchParams.get("limit") ?? "100",
      startDate: searchParams.get("start") ?? undefined,
      endDate: searchParams.get("end") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    return ringlogixFailure(err);
  }
}
