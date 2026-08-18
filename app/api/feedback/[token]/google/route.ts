import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getReviewByToken, markClickedGoogle } from "@/lib/db/ticket-reviews";

// Tracks click-through before handing off to the real Google review page.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const googleReviewUrl = process.env.GOOGLE_REVIEW_URL;
  if (!googleReviewUrl) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const supabase = createServiceRoleClient();
  const review = await getReviewByToken(supabase, token);
  if (review && review.rating === 5) {
    await markClickedGoogle(supabase, token);
  }

  return NextResponse.redirect(googleReviewUrl);
}
