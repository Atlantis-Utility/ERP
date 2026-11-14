import { NextResponse } from "next/server";
import { requireEmployee, ApiAuthError } from "@/lib/api-auth";
import { callerHasPageOption } from "@/lib/page-options-server";
import { CUSTOMER_BROADCAST } from "@/lib/page-options";
import { createServiceRoleClient, createClient } from "@/lib/supabase/server";
import { listCachedCustomers } from "@/lib/db/ringlogix-customers";
import { isEmailConfigured, sendEmail, sendEmailBatch } from "@/lib/email/resend";
import { buildBroadcastEmail, type BroadcastContent } from "@/lib/email/broadcast-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sends one bulletin to many customers.
 *
 * The thing this route exists to prevent is a mail going somewhere it
 * shouldn't. Three rules, in order:
 *
 *  1. You need the grant. Not an employee account - the "Email customers"
 *     option (lib/page-options.ts), held by the people allowed to speak for
 *     the company.
 *  2. Every address is checked against the customer list on the server.
 *     The browser decides *which* customers; it does not get to invent an
 *     address. Anything not on file is dropped and reported back, so a
 *     typo shows up as a refusal rather than as a mail to a stranger.
 *  3. A test goes to you and nobody else, whatever the body asks for.
 *
 * Replies go to the ticket mailbox rather than the no-reply sending
 * address, so a customer answering "is my site affected?" opens a ticket
 * instead of falling into a void.
 */

const REPLY_TO = "ticket@atlantisutility.com";
/** Above this, somebody is sending to everyone twice over by accident. */
const MAX_RECIPIENTS = 600;

interface Body {
  subject?: string;
  content?: BroadcastContent;
  recipients?: Array<{ email?: string; name?: string }>;
  test?: boolean;
}

const normalize = (e: string) => e.trim().toLowerCase();
const looksLikeEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/**
 * Every address we hold for a customer: the account address from the
 * RingLogix portal cache, plus any contacts typed into the customer's
 * profile. This is the whole world a broadcast may reach.
 */
async function addressesOnFile(): Promise<Set<string>> {
  const allowed = new Set<string>();

  const supabase = await createClient();
  try {
    for (const c of await listCachedCustomers(supabase)) {
      if (c.email) allowed.add(normalize(c.email));
    }
  } catch (err) {
    console.warn("[broadcast] customer cache unreadable:", err);
  }

  const admin = createServiceRoleClient();
  const { data } = await admin.from("customer_profiles").select("contacts");
  for (const row of data ?? []) {
    for (const contact of (row.contacts as Array<{ email?: string }> | null) ?? []) {
      if (contact?.email) allowed.add(normalize(contact.email));
    }
  }

  return allowed;
}

export async function POST(req: Request) {
  try {
    const actor = await requireEmployee();
    if (!(await callerHasPageOption(CUSTOMER_BROADCAST))) {
      throw new ApiAuthError("You don't have permission to email customers", 403);
    }
    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: "Outbound email isn't configured on this server, so nothing was sent." },
        { status: 503 },
      );
    }

    const body = (await req.json()) as Body;
    const subject = (body.subject ?? "").trim();
    const content = body.content;
    if (!subject) return NextResponse.json({ error: "The email needs a subject." }, { status: 400 });
    if (!content || typeof content.body !== "string" || !content.body.trim()) {
      return NextResponse.json({ error: "The email needs a message." }, { status: 400 });
    }

    // A test is to the sender, full stop. It ignores the recipient list
    // entirely rather than filtering it, so there is no shape of request
    // that sends a draft to a customer.
    if (body.test) {
      const { html } = buildBroadcastEmail(content, { customerName: null });
      await sendEmail({ to: actor.email, subject: `[Test] ${subject}`, html, replyTo: REPLY_TO });
      return NextResponse.json({ ok: true, test: true, sent: 1, to: actor.email });
    }

    const asked = body.recipients ?? [];
    if (asked.length === 0) {
      return NextResponse.json({ error: "No recipients selected." }, { status: 400 });
    }
    if (asked.length > MAX_RECIPIENTS) {
      return NextResponse.json(
        { error: `That's ${asked.length} recipients, more than this is allowed to send at once.` },
        { status: 400 },
      );
    }

    const allowed = await addressesOnFile();
    const seen = new Set<string>();
    const messages: Array<{ to: string; subject: string; html: string; replyTo: string }> = [];
    const rejected: Array<{ email: string; reason: string }> = [];

    for (const r of asked) {
      const email = normalize(r.email ?? "");
      if (!email || !looksLikeEmail(email)) {
        rejected.push({ email: r.email ?? "(blank)", reason: "not an email address" });
        continue;
      }
      // One customer, one copy - several sites under one billing address is
      // normal here, and three identical outage notices is not.
      if (seen.has(email)) continue;
      if (!allowed.has(email)) {
        rejected.push({ email, reason: "not an address we hold for a customer" });
        continue;
      }
      seen.add(email);
      const { html } = buildBroadcastEmail(content, { customerName: r.name ?? null });
      messages.push({ to: email, subject, html, replyTo: REPLY_TO });
    }

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "None of those addresses are on file for a customer.", rejected },
        { status: 400 },
      );
    }

    const { sent, failures } = await sendEmailBatch(messages);

    console.log(
      `[broadcast] ${actor.email} sent "${subject}" to ${sent}/${messages.length}` +
        `${failures.length ? `, ${failures.length} failed` : ""}` +
        `${rejected.length ? `, ${rejected.length} rejected` : ""}`,
    );

    // Best effort: the table may not exist yet (supabase/migration-broadcasts.sql).
    // A send that happened is not undone by a log that didn't.
    try {
      const admin = createServiceRoleClient();
      await admin.from("broadcasts").insert({
        subject,
        kind: content.kind,
        headline: content.headline ?? "",
        body: content.body,
        recipient_count: sent,
        recipients: messages.map((m) => m.to),
        sent_by: actor.email,
        sent_by_name: actor.name,
      });
    } catch (err) {
      console.warn("[broadcast] not recorded:", err);
    }

    return NextResponse.json({ ok: true, sent, failures, rejected });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[broadcast]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
