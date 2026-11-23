import { NextRequest, NextResponse } from "next/server";
import { getCallRequests, addWakeUpCall, deleteWakeUpCall, isConfigured, ourDomain } from "@/lib/ringlogix";
import { ringlogixFailure } from "@/lib/ringlogix-response";
import { denyUnlessEmployee } from "@/lib/ringlogix-guard";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessEmployee();
  if (denied) return denied;

  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const p = req.nextUrl.searchParams;
  const domain = p.get("domain")?.trim() || ourDomain();
  const user = p.get("user")?.trim() ?? "";

  // A call request belongs to the extension it will ring, so there is no
  // domain-wide read to fall back on: without a user the API answers
  // "Missing parameter 'orig_address'", which used to surface as a 500 on
  // a page that had asked the only way it knew how.
  if (!user) {
    return NextResponse.json(
      { error: "Wake-up calls are read per extension, so this needs a `user` - the extension to look at." },
      { status: 400 },
    );
  }

  try {
    const data = await getCallRequests({ domain, user });
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
    const data = await addWakeUpCall(body.uid, {
      timeToCall: body.timeToCall,
      dDay: body.dDay, dHour: body.dHour, dMin: body.dMin,
    });
    return NextResponse.json(data);
  } catch (err) {
    return ringlogixFailure(err);
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await denyUnlessEmployee();
  if (denied) return denied;

  if (!isConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    const body = await req.json();
    const data = await deleteWakeUpCall(body.uid, body.requestId);
    return NextResponse.json(data);
  } catch (err) {
    return ringlogixFailure(err);
  }
}
