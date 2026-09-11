"use client";

import { useEffect, useState } from "react";
import { Star, Check, AlertCircle } from "lucide-react";
import {
  sendReviewRequest,
  reviewRequestReason,
  type ReviewRequestTarget,
} from "@/lib/tickets/review-request";

interface Props {
  /** Null keeps the dialog closed; set it to prompt for that ticket. */
  target: ReviewRequestTarget | null;
  onClose: () => void;
}

type Phase = "ask" | "sending" | "sent" | "failed";

/**
 * Asks whether to email the customer a feedback request after their ticket is
 * closed. Declining sends nothing — it isn't recorded as sent either, so
 * closing the ticket again later will offer it again.
 */
export default function FeedbackRequestDialog({ target, onClose }: Props) {
  // Mounting only while prompting means each prompt starts from a clean
  // "ask" state, so there's no reset effect to keep in sync.
  if (!target) return null;
  return <Prompt key={target.id} target={target} onClose={onClose} />;
}

function Prompt({ target, onClose }: { target: ReviewRequestTarget; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("ask");
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const recipient = target.customerEmail?.trim();

  async function send() {
    setPhase("sending");
    const result = await sendReviewRequest(target).catch((err) => ({
      sent: false as const,
      reason: err instanceof Error ? err.message : "request_failed",
    }));
    if (result.sent) {
      setPhase("sent");
    } else {
      setError(reviewRequestReason(result.reason));
      setPhase("failed");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-[#eaeaea] shadow-2xl w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 border ${
            phase === "sent"
              ? "bg-[#f0fdf4] border-[#bbf7d0]"
              : phase === "failed"
                ? "bg-[#fef2f2] border-[#fecaca]"
                : "bg-[#eff6ff] border-[#bfdbfe]"
          }`}
        >
          {phase === "sent" ? (
            <Check className="w-5 h-5 text-[#17c964]" />
          ) : phase === "failed" ? (
            <AlertCircle className="w-5 h-5 text-[#dc2626]" />
          ) : (
            <Star className="w-5 h-5 text-[#0070f3]" />
          )}
        </div>

        {phase === "sent" ? (
          <>
            <h2 className="text-base font-semibold text-[#0a0a0a] mb-1.5">Feedback request sent</h2>
            <p className="text-sm text-[#666] leading-relaxed mb-6">
              {recipient ? <>We emailed <span className="text-[#0a0a0a]">{recipient}</span> a link to rate this ticket.</> : "The customer has been emailed a link to rate this ticket."}
            </p>
            <button
              onClick={onClose}
              className="w-full bg-[#0a0a0a] text-white text-sm font-medium py-2.5 rounded-xl hover:bg-[#333] transition-colors"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-[#0a0a0a] mb-1.5">
              Send a feedback request?
            </h2>
            <p className="text-sm text-[#666] leading-relaxed mb-4">
              This ticket is closed. You can email{" "}
              <span className="text-[#0a0a0a]">{target.customerName || "the customer"}</span> a short
              star-rating link asking how it went.
            </p>

            {recipient ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#fafafa] border border-[#eaeaea] mb-4">
                <Star className="w-3.5 h-3.5 text-[#bbb] shrink-0" />
                <span className="text-[13px] text-[#333] truncate">{recipient}</span>
              </div>
            ) : (
              <p className="text-[13px] text-[#999] mb-4">
                The recipient will be looked up from the ticket record.
              </p>
            )}

            {phase === "failed" && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[#fef2f2] border border-[#fecaca] mb-4">
                <AlertCircle className="w-3.5 h-3.5 text-[#b91c1c] shrink-0 mt-px" />
                <p className="text-[13px] text-[#b91c1c]">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={phase === "sending"}
                className="flex-1 border border-[#eaeaea] bg-white text-sm font-medium text-[#444] py-2.5 rounded-xl hover:bg-[#fafafa] transition-colors disabled:opacity-50"
              >
                {phase === "failed" ? "Close" : "Don't send"}
              </button>
              <button
                onClick={send}
                disabled={phase === "sending"}
                className="flex-1 bg-[#0a0a0a] text-white text-sm font-medium py-2.5 rounded-xl hover:bg-[#333] transition-colors disabled:opacity-50"
              >
                {phase === "sending" ? "Sending…" : phase === "failed" ? "Try again" : "Send request"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
