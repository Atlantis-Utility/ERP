import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "ticket_reviews";

export type ReviewStatus = "sent" | "rated" | "completed";

export interface TicketReview {
  token: string;
  ticketId: string;
  customerName: string | null;
  customerEmail: string | null;
  subject: string | null;
  rating: number | null;
  feedback: string | null;
  status: ReviewStatus;
  clickedGoogle: boolean;
}

function fromRow(row: Record<string, unknown>): TicketReview {
  return {
    token: row.token as string,
    ticketId: row.ticket_id as string,
    customerName: (row.customer_name as string) ?? null,
    customerEmail: (row.customer_email as string) ?? null,
    subject: (row.subject as string) ?? null,
    rating: (row.rating as number) ?? null,
    feedback: (row.feedback as string) ?? null,
    status: row.status as ReviewStatus,
    clickedGoogle: Boolean(row.clicked_google),
  };
}

// One review request per ticket, ever — used to avoid re-emailing a ticket
// that's closed, reopened, and closed again.
export async function findReviewByTicketId(supabase: SupabaseClient, ticketId: string): Promise<TicketReview | null> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("ticket_id", ticketId).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

export async function getReviewByToken(supabase: SupabaseClient, token: string): Promise<TicketReview | null> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("token", token).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

export async function createReviewRequest(
  supabase: SupabaseClient,
  opts: { token: string; ticketId: string; customerName: string; customerEmail: string; subject: string },
): Promise<void> {
  const { error } = await supabase.from(TABLE).insert({
    token: opts.token,
    ticket_id: opts.ticketId,
    customer_name: opts.customerName,
    customer_email: opts.customerEmail,
    subject: opts.subject,
  });
  if (error) throw error;
}

export async function submitRating(supabase: SupabaseClient, token: string, rating: number): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({
      rating,
      status: rating >= 5 ? "completed" : "rated",
      responded_at: new Date().toISOString(),
    })
    .eq("token", token);
  if (error) throw error;
}

export async function submitFeedback(supabase: SupabaseClient, token: string, feedback: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ feedback, status: "completed", responded_at: new Date().toISOString() })
    .eq("token", token);
  if (error) throw error;
}

export async function markClickedGoogle(supabase: SupabaseClient, token: string): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ clicked_google: true }).eq("token", token);
  if (error) throw error;
}
