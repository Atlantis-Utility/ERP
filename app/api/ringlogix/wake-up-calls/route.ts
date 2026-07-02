import { NextRequest, NextResponse } from "next/server";
import { getCallRequests, addWakeUpCall, deleteWakeUpCall, isConfigured } from "@/lib/ringlogix";

export async function GET(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const p = req.nextUrl.searchParams;
  try {
    const data = await getCallRequests({
      domain: p.get("domain") ?? undefined,
      user:   p.get("user")   ?? undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    const body = await req.json();
    const data = await addWakeUpCall(body.uid, {
      timeToCall: body.timeToCall,
      dDay: body.dDay, dHour: body.dHour, dMin: body.dMin,
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    const body = await req.json();
    const data = await deleteWakeUpCall(body.uid, body.requestId);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
