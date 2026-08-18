"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface ReviewState {
  customerName: string | null;
  subject: string | null;
  rating: number | null;
  status: "sent" | "rated" | "completed";
  googleReviewUrl: string | null;
}

type ViewState = "loading" | "error" | "ok" | "not_found";

export default function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const searchParams = useSearchParams();
  const ratingParam = Number(searchParams.get("rating"));

  const [view, setView] = useState<ViewState>("loading");
  const [review, setReview] = useState<ReviewState | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    fetch(`/api/feedback/${token}`)
      .then(async (res) => {
        if (res.status === 404) { setView("not_found"); return; }
        if (!res.ok) throw new Error("Failed to load");
        const data: ReviewState = await res.json();
        setReview(data);
        setSelected(data.rating ?? (ratingParam >= 1 && ratingParam <= 5 ? ratingParam : null));
        setView("ok");
      })
      .catch(() => setView("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function confirmRating() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/feedback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: selected }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setReview((r) => (r ? { ...r, rating: selected, status: data.status, googleReviewUrl: data.googleReviewUrl } : r));
    } catch {
      setView("error");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitFeedback() {
    if (!feedback.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/feedback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback.trim() }),
      });
      if (!res.ok) throw new Error();
      setFeedbackSent(true);
    } catch {
      setView("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa] px-4">
      <div className="w-full max-w-md bg-white border border-[#eaeaea] rounded-xl p-8 text-center">
        <p className="text-xs font-semibold text-[#999] uppercase tracking-wide mb-1">Atlantis Utility</p>

        {view === "loading" && <p className="text-sm text-[#666] mt-6">Loading…</p>}
        {view === "not_found" && <p className="text-sm text-[#666] mt-6">This feedback link isn&apos;t valid.</p>}
        {view === "error" && <p className="text-sm text-[#f31260] mt-6">Something went wrong. Please try again shortly.</p>}

        {view === "ok" && review && (
          <>
            <h1 className="text-lg font-semibold text-[#0a0a0a] mt-2 mb-6">
              {review.status === "completed" ? "Thank you!" : "How did we do?"}
            </h1>

            {review.status !== "completed" && (
              <>
                <p className="text-sm text-[#666] mb-6">
                  {review.subject ? `Regarding: "${review.subject}"` : "Please rate your recent support experience."}
                </p>
                <div className="flex justify-center gap-2 mb-6">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setSelected(n)}
                      className={`w-11 h-11 rounded-lg border text-lg transition-colors ${
                        selected === n
                          ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                          : "bg-white text-[#999] border-[#eaeaea] hover:border-[#ccc]"
                      }`}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                {review.status === "sent" && (
                  <button
                    onClick={confirmRating}
                    disabled={!selected || submitting}
                    className="w-full bg-[#0070f3] text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40"
                  >
                    {submitting ? "Submitting…" : "Submit rating"}
                  </button>
                )}
              </>
            )}

            {review.status === "rated" && review.rating !== null && review.rating < 5 && !feedbackSent && (
              <div className="mt-2 text-left">
                <label className="block text-sm text-[#666] mb-2">What could we have done better?</label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={4}
                  className="w-full border border-[#eaeaea] rounded-lg p-3 text-sm focus:outline-none focus:border-[#0070f3]"
                  placeholder="Tell us what didn't meet your expectations…"
                />
                <button
                  onClick={submitFeedback}
                  disabled={!feedback.trim() || submitting}
                  className="w-full mt-3 bg-[#0070f3] text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40"
                >
                  {submitting ? "Submitting…" : "Send feedback"}
                </button>
              </div>
            )}

            {review.status === "rated" && feedbackSent && (
              <p className="text-sm text-[#666] mt-2">Thanks for the feedback — we&apos;ll use it to improve.</p>
            )}

            {review.status === "completed" && review.rating === 5 && (
              <>
                <p className="text-sm text-[#666] mb-6">We&apos;re thrilled you had a great experience. Would you mind sharing it on Google?</p>
                {review.googleReviewUrl ? (
                  <a
                    href={`/api/feedback/${token}/google`}
                    className="inline-block w-full bg-[#0070f3] text-white text-sm font-medium py-2.5 rounded-lg"
                  >
                    Leave a Google review
                  </a>
                ) : (
                  <p className="text-xs text-[#999]">(Review link not configured yet.)</p>
                )}
              </>
            )}

            {review.status === "completed" && review.rating !== null && review.rating < 5 && (
              <p className="text-sm text-[#666]">Thanks for the feedback — we&apos;ll use it to improve.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
