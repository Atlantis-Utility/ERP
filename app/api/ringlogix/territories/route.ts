import { NextResponse } from "next/server";
import { TERRITORIES_UNAVAILABLE, ourTerritory } from "@/lib/ringlogix";
import { denyUnlessEmployee } from "@/lib/ringlogix-guard";

export const runtime = "nodejs";

/**
 * There is no territory object on this API.
 *
 * `territory/read` is answered "Bad request. Unknown object." - not a
 * permission the Reseller scope lacks, it simply does not exist. Answered
 * 501 rather than 500, because a failure a retry cannot fix should not
 * look like one it could.
 *
 * The one territory that matters is ours, which is in the API user's own
 * client id, so it is returned here instead of nothing at all.
 */
export async function GET() {
  const denied = await denyUnlessEmployee();
  if (denied) return denied;

  return NextResponse.json(
    { error: TERRITORIES_UNAVAILABLE, ours: ourTerritory() },
    { status: 501 },
  );
}
