import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireEmployee, ApiAuthError } from "@/lib/api-auth";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { buildTicketAssignedEmail } from "@/lib/email/ticket-assigned-email";
import { appOrigin } from "@/lib/app-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tells somebody a ticket is theirs now.
 *
 * Assignment was silent: the person it was handed to found out when they
 * next happened to open the Tickets page, which for a customer waiting on a
 * reply is too late to be any use. The in-app notification list can't cover
 * it either - lib/notifications keeps it in localStorage, so a notification
 * raised in the assigner's browser never reaches the assignee's.
 *
 * As with notify/access, the recipient is named by employee id and this
 * route looks the address up itself: it cannot be pointed at an outsider,
 * so it is a notifier rather than a relay anybody with a session could send
 * mail through.
 *
 * Unlike notify/access it does check the assignment is real, because here it
 * cheaply can - both kinds of ticket keep their assignee in one known table.
 * An email about a ticket that isn't yours is worse than no email, and this
 * is what stops a stale or mistaken call producing one.
 */
export async function POST(req: Request) {
  try {
    const actor = await requireEmployee();
    const body = (await req.json()) as {
      toEmployeeId?: string;
      ticketId?: string;
      /** "email" for a Graph thread, anything else for a manual ticket. */
      source?: string;
      subject?: string;
      customerName?: string;
      priority?: string;
      previousAssigneeName?: string;
    };

    const toEmployeeId = (body.toEmployeeId ?? "").trim();
    const ticketId = (body.ticketId ?? "").trim();
    if (!toEmployeeId || !ticketId) {
      return NextResponse.json({ error: "Nothing to notify about" }, { status: 400 });
    }
    const isEmailTicket = body.source === "email";

    // Telling yourself is a no-op, not a failure. Checked before the email
    // config, so picking your own name out of the list behaves the same way
    // on a server with no mailer as on one with.
    if (toEmployeeId === actor.employeeId) {
      return NextResponse.json({ sent: false, reason: "self" });
    }

    if (!isEmailConfigured()) {
      return NextResponse.json({ error: "EMAIL_NOT_CONFIGURED" }, { status: 503 });
    }

    const db = createServiceRoleClient();

    const { data: recipient } = await db
      .from("employees")
      .select("id, name, email")
      .eq("id", toEmployeeId)
      .maybeSingle();
    const to = recipient as { id: string; name: string; email: string | null } | null;
    if (!to?.email) {
      return NextResponse.json({ error: "NO_EMAIL_ON_FILE" }, { status: 422 });
    }

    // What the ticket actually says, rather than what the caller claims.
    // A manual ticket is a row of its own, so everything comes from there; an
    // email ticket is a Microsoft Graph thread with only a status/assignee
    // overlay in our database, so its subject has to come from the client -
    // reading it back would mean a Graph round trip for a subject line.
    let subject = (body.subject ?? "").trim();
    let customerName = (body.customerName ?? "").trim();
    let priority = (body.priority ?? "").trim();
    let ticketNumber: number | null = null;
    let assignedTo: string | null = null;

    if (isEmailTicket) {
      const { data } = await db
        .from("tickets")
        .select("assignee_id, priority")
        .eq("id", ticketId)
        .maybeSingle();
      const row = data as { assignee_id: string | null; priority: string | null } | null;
      assignedTo = row?.assignee_id ?? null;
      priority = row?.priority ?? priority;
    } else {
      const { data } = await db
        .from("manual_tickets")
        .select("assignee_id, ticket_number, subject, customer_name, priority")
        .eq("id", ticketId)
        .maybeSingle();
      const row = data as {
        assignee_id: string | null;
        ticket_number: number | null;
        subject: string | null;
        customer_name: string | null;
        priority: string | null;
      } | null;
      assignedTo = row?.assignee_id ?? null;
      ticketNumber = row?.ticket_number ?? null;
      subject = row?.subject?.trim() || subject;
      customerName = row?.customer_name?.trim() || customerName;
      priority = row?.priority ?? priority;
    }

    if (assignedTo !== toEmployeeId) {
      // Not an error the person who clicked should see: the assignment this
      // is about isn't what the ticket records, so the right thing is to say
      // nothing to anybody.
      console.warn("[notify/ticket-assignment] skipped, ticket is not assigned to that employee", {
        ticketId,
        toEmployeeId,
        assignedTo,
      });
      return NextResponse.json({ sent: false, reason: "not-assigned" });
    }

    const path = isEmailTicket
      ? `/tickets/${encodeURIComponent(ticketId)}`
      : `/tickets?ticket=${encodeURIComponent(ticketId)}`;

    const mail = buildTicketAssignedEmail({
      subject,
      ticketNumber,
      toName: to.name,
      fromName: actor.name,
      customerName,
      priority,
      previousAssigneeName: (body.previousAssigneeName ?? "").trim() || null,
      url: `${appOrigin(req)}${path}`,
    });
    await sendEmail({ to: to.email, subject: mail.subject, html: mail.html });

    return NextResponse.json({ sent: true, to: to.email });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[notify/ticket-assignment]", err);
    return NextResponse.json({ error: "Couldn't send that notification" }, { status: 500 });
  }
}
