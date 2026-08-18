import type { SupabaseClient } from "@supabase/supabase-js";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { buildFeedbackNotificationEmail } from "@/lib/email/feedback-notification-email";

// A ticket id may belong to either manual_tickets or the tickets (email)
// overlay table — both carry assignee_id/assignee_name, so just try each.
async function findAssignee(supabase: SupabaseClient, ticketId: string): Promise<{ id: string; name: string | null } | null> {
  const { data: manual } = await supabase.from("manual_tickets").select("assignee_id, assignee_name").eq("id", ticketId).maybeSingle();
  if (manual) return manual.assignee_id ? { id: manual.assignee_id as string, name: (manual.assignee_name as string) ?? null } : null;

  const { data: emailTicket } = await supabase.from("tickets").select("assignee_id, assignee_name").eq("id", ticketId).maybeSingle();
  return emailTicket?.assignee_id ? { id: emailTicket.assignee_id as string, name: (emailTicket.assignee_name as string) ?? null } : null;
}

// Notifies the ticket's assignee (if any) plus every admin, every time a
// customer finishes answering a review request — regardless of assignment.
export async function notifyStaffOfFeedback(
  supabase: SupabaseClient,
  opts: { ticketId: string; customerName: string; subject: string; rating: number; feedback: string | null },
): Promise<void> {
  if (!isEmailConfigured()) {
    console.error(`[feedback-notify] ticket ${opts.ticketId}: RESEND_API_KEY/RESEND_FROM_EMAIL not set in this environment`);
    return;
  }

  const recipients = new Set<string>();

  const { data: admins, error: adminErr } = await supabase.from("user_profiles").select("email").eq("is_admin", true);
  if (adminErr) console.error(`[feedback-notify] ticket ${opts.ticketId}: failed to load admins — ${adminErr.message}`);
  for (const admin of admins ?? []) {
    if (admin.email) recipients.add(admin.email as string);
  }

  const assignee = await findAssignee(supabase, opts.ticketId);
  if (assignee) {
    const { data: employee } = await supabase.from("employees").select("email").eq("id", assignee.id).maybeSingle();
    if (employee?.email) recipients.add(employee.email as string);
  }

  if (recipients.size === 0) {
    console.error(`[feedback-notify] ticket ${opts.ticketId}: no recipients (no admins with an email, no assignee)`);
    return;
  }

  const { subject, html } = buildFeedbackNotificationEmail({
    customerName: opts.customerName,
    subject: opts.subject,
    rating: opts.rating,
    feedback: opts.feedback,
    assigneeName: assignee?.name ?? null,
  });

  try {
    await sendEmail({ to: [...recipients], subject, html });
    console.log(`[feedback-notify] ticket ${opts.ticketId}: notified ${recipients.size} recipient(s)`);
  } catch (err) {
    console.error(`[feedback-notify] ticket ${opts.ticketId}: send failed — ${err instanceof Error ? err.message : "unknown error"}`);
  }
}
