import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getReviewByToken, submitRating, submitFeedback } from "@/lib/db/ticket-reviews";
import { notifyStaffOfFeedback } from "@/lib/email/send-feedback-notification";

// Public, unauthenticated — the token itself is the access credential.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceRoleClient();
  const review = await getReviewByToken(supabase, token);
  if (!review) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    customerName: review.customerName,
    subject: review.subject,
    rating: review.rating,
    status: review.status,
    googleReviewUrl: review.status === "completed" && review.rating === 5 ? process.env.GOOGLE_REVIEW_URL ?? null : null,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const supabase = createServiceRoleClient();

  const review = await getReviewByToken(supabase, token);
  if (!review) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (review.status === "completed") {
    return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  }

  if (typeof body.rating === "number") {
    const rating = Math.round(body.rating);
    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: "invalid_rating" }, { status: 400 });
    }
    await submitRating(supabase, token, rating);
    if (rating >= 5) {
      await notifyStaffOfFeedback(supabase, {
        ticketId: review.ticketId,
        customerName: review.customerName ?? "",
        subject: review.subject ?? "",
        rating,
        feedback: null,
      });
    }
    return NextResponse.json({
      ok: true,
      status: rating >= 5 ? "completed" : "rated",
      googleReviewUrl: rating >= 5 ? process.env.GOOGLE_REVIEW_URL ?? null : null,
    });
  }

  if (typeof body.feedback === "string") {
    if (review.rating === null) {
      return NextResponse.json({ error: "rate_first" }, { status: 400 });
    }
    const feedbackText = body.feedback.slice(0, 2000);
    await submitFeedback(supabase, token, feedbackText);
    await notifyStaffOfFeedback(supabase, {
      ticketId: review.ticketId,
      customerName: review.customerName ?? "",
      subject: review.subject ?? "",
      rating: review.rating,
      feedback: feedbackText,
    });
    return NextResponse.json({ ok: true, status: "completed" });
  }

  return NextResponse.json({ error: "invalid_request" }, { status: 400 });
}
