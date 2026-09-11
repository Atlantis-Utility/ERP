"use client";

// Client-side trigger for the "how did we do" feedback email.
//
// This used to fire automatically whenever a ticket was saved as closed. It's
// now opt-in per close: the pages prompt with FeedbackRequestDialog and only
// call this if the user chooses to send.
//
// The server still dedupes by ticket id (sendReviewRequestOnce), so a customer
// can never receive two requests for the same ticket — but declining here means
// nothing is recorded, so closing the ticket again later can still send one.

export interface ReviewRequestTarget {
  id: string;
  /** Manual tickets look the customer up server-side; email tickets don't exist in Supabase. */
  isManual: boolean;
  subject: string;
  customerName: string;
  customerEmail?: string;
}

export type ReviewRequestOutcome = { sent: true } | { sent: false; reason: string };

export async function sendReviewRequest(t: ReviewRequestTarget): Promise<ReviewRequestOutcome> {
  const url = t.isManual
    ? `/api/tickets/manual/${t.id}/review-request`
    : `/api/tickets/${t.id}/review-request`;

  const res = await fetch(url, {
    method: "POST",
    // The manual route reads the customer from Supabase and ignores any body.
    ...(t.isManual
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerEmail: t.customerEmail,
            customerName: t.customerName,
            subject: t.subject,
          }),
        }),
  });

  const data = await res.json().catch(() => ({}));
  if (data.reviewSent) return { sent: true };
  return { sent: false, reason: data.reason ?? data.error ?? `http_${res.status}` };
}

/** Turns the API's machine reasons into something worth showing a user. */
export function reviewRequestReason(reason: string): string {
  switch (reason) {
    case "no_customer_email":
      return "This ticket has no customer email address on file.";
    case "email_not_configured":
      return "Outbound email isn't configured on the server, so nothing was sent.";
    case "already_sent":
      return "A feedback request had already been sent for this ticket.";
    default:
      return reason;
  }
}
