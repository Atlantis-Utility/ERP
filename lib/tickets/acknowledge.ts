import { getGraphToken, TICKET_MAILBOX_ENCODED } from "@/app/api/tickets/_ms-auth";
import { buildTicketAcknowledgementEmail } from "@/lib/email/ticket-acknowledgement-email";

/**
 * The automatic "we have your request" reply to a new ticket.
 *
 * Tickets arrive as email in the shared ticket mailbox — there is no webhook
 * and nothing in the app knows a ticket was created, so this runs on a
 * schedule and works out for itself which threads are new and unanswered
 * (app/api/cron/ticket-acknowledgements).
 *
 * It replies *inside the customer's own thread* rather than sending a fresh
 * message, so their reply comes back to the same conversation and stays on
 * the same ticket. That is also what makes it safe to re-run: a thread we
 * have answered contains a message from us, and that is the thing it checks.
 *
 * The rules below are all about not emailing somebody we shouldn't. An
 * acknowledgement is cheap to miss and expensive to get wrong — a loop with
 * another robot, or a "we'll be in touch shortly" sent to a customer a
 * colleague answered an hour ago, is worse than silence.
 */

/** Us. A thread any of us has touched is not waiting on a robot. */
const OUR_DOMAIN = "atlantisutility.com";
const MAILBOX = decodeURIComponent(TICKET_MAILBOX_ENCODED).toLowerCase();

/** Robots. Replying to one of these is how mail loops start. */
const NOREPLY_PATTERN = /noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce/i;

/** Their robots. An out-of-office is not a support request. */
const AUTO_SUBJECT_PATTERN = /^\s*(automatic reply|auto:|out of office|undeliverable|delivery status notification)/i;

/**
 * How far back a run looks. It is also the backstop against a first run
 * acknowledging a year of mail: anything older than this is treated as
 * history, answered or not.
 */
export const DEFAULT_LOOKBACK_MINUTES = 120;

const GRAPH = "https://graph.microsoft.com/v1.0";

interface GraphMessage {
  id: string;
  conversationId: string;
  subject?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  receivedDateTime?: string;
}

export interface AcknowledgementCandidate {
  messageId: string;
  conversationId: string;
  subject: string;
  to: string;
  toName: string;
  receivedAt: string;
}

export interface AcknowledgeResult {
  /** Threads we replied to (or would have, on a dry run). */
  acknowledged: AcknowledgementCandidate[];
  /** Everything we decided against, and why — this is the part worth reading. */
  skipped: Array<{ subject: string; from: string; reason: string }>;
  dryRun: boolean;
  lookbackMinutes: number;
}

async function graph<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Graph ${init?.method ?? "GET"} ${path.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  // /send answers 202 with no body.
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

const isOurs = (address: string) => address.toLowerCase().endsWith(`@${OUR_DOMAIN}`);

/**
 * Everything in the conversation, across folders — their messages, ours,
 * and anything sent from a colleague's own account. Staff here answer from
 * their personal addresses with the shared mailbox on the thread, so "have
 * we replied" cannot be "is there a message from the ticket mailbox".
 */
async function conversationSenders(token: string, conversationId: string): Promise<string[]> {
  // Single quotes inside an OData string literal are escaped by doubling.
  const literal = encodeURIComponent(conversationId.replace(/'/g, "''"));
  const data = await graph<{ value?: GraphMessage[] }>(
    token,
    `/users/${TICKET_MAILBOX_ENCODED}/messages?$filter=conversationId eq '${literal}'&$select=from,receivedDateTime&$top=100`,
  );
  return (data.value ?? []).map((m) => m.from?.emailAddress?.address ?? "").filter(Boolean);
}

/** The reply itself: a draft in their thread, filled in, then sent. */
async function replyInThread(token: string, messageId: string, html: string): Promise<void> {
  const draft = await graph<{ id: string }>(
    token,
    `/users/${TICKET_MAILBOX_ENCODED}/messages/${messageId}/createReply`,
    { method: "POST" },
  );
  await graph(token, `/users/${TICKET_MAILBOX_ENCODED}/messages/${draft.id}`, {
    method: "PATCH",
    body: JSON.stringify({ body: { contentType: "HTML", content: html } }),
  });
  await graph(token, `/users/${TICKET_MAILBOX_ENCODED}/messages/${draft.id}/send`, { method: "POST" });
}

/**
 * Finds new, unanswered threads and acknowledges them.
 *
 * `dryRun` does everything but send, which is how you check what a schedule
 * change would have done before it does it.
 */
export async function acknowledgeNewTickets(opts?: {
  lookbackMinutes?: number;
  dryRun?: boolean;
}): Promise<AcknowledgeResult> {
  const lookbackMinutes = opts?.lookbackMinutes ?? DEFAULT_LOOKBACK_MINUTES;
  const dryRun = opts?.dryRun ?? false;
  const token = await getGraphToken();

  const since = new Date(Date.now() - lookbackMinutes * 60_000).toISOString();
  const inbox = await graph<{ value?: GraphMessage[] }>(
    token,
    `/users/${TICKET_MAILBOX_ENCODED}/mailFolders/inbox/messages` +
      `?$filter=receivedDateTime ge ${since}` +
      `&$select=id,conversationId,subject,from,receivedDateTime` +
      `&$orderby=receivedDateTime desc&$top=50`,
  );

  const result: AcknowledgeResult = { acknowledged: [], skipped: [], dryRun, lookbackMinutes };

  // Oldest first, so the message we reply to is the one that opened the
  // thread rather than whichever arrived last.
  const messages = [...(inbox.value ?? [])].sort((a, b) =>
    (a.receivedDateTime ?? "").localeCompare(b.receivedDateTime ?? ""),
  );

  const handled = new Set<string>();
  for (const m of messages) {
    const from = m.from?.emailAddress?.address ?? "";
    const subject = (m.subject ?? "").trim();
    const skip = (reason: string) => result.skipped.push({ subject, from, reason });

    if (handled.has(m.conversationId)) continue;
    handled.add(m.conversationId);

    if (!from) { skip("no sender"); continue; }
    if (isOurs(from)) { skip("from us"); continue; }
    if (NOREPLY_PATTERN.test(from)) { skip("no-reply address"); continue; }
    if (AUTO_SUBJECT_PATTERN.test(subject)) { skip("automatic reply"); continue; }

    // The one rule that matters, and the reason this is safe to re-run:
    // if anybody here has sent into this thread, it is answered. Our own
    // acknowledgement comes from the ticket mailbox, so it is caught by the
    // same check - a thread cannot be acknowledged twice.
    const senders = await conversationSenders(token, m.conversationId);
    const ours = senders.filter(isOurs).map((a) => a.toLowerCase());
    if (ours.length > 0) {
      skip(ours.every((a) => a === MAILBOX) ? "already acknowledged" : "already answered by a person");
      continue;
    }

    const candidate: AcknowledgementCandidate = {
      messageId: m.id,
      conversationId: m.conversationId,
      subject: subject || "(no subject)",
      to: from,
      toName: m.from?.emailAddress?.name ?? "",
      receivedAt: m.receivedDateTime ?? "",
    };

    if (dryRun) {
      result.acknowledged.push(candidate);
      continue;
    }

    const { html } = buildTicketAcknowledgementEmail({ customerName: candidate.toName });
    try {
      await replyInThread(token, m.id, html);
      result.acknowledged.push(candidate);
      console.log(`[ticket-ack] acknowledged ${from} — "${candidate.subject}"`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[ticket-ack] failed for ${from}:`, reason);
      skip(`send failed: ${reason}`);
    }
  }

  return result;
}

/**
 * One acknowledgement, as a fresh message rather than a reply, so it can be
 * read without waiting for a customer to email in. Same template, same
 * mailbox, same Graph call that does the real sending.
 */
export async function sendTestAcknowledgement(to: string, name?: string): Promise<void> {
  const token = await getGraphToken();
  const built = buildTicketAcknowledgementEmail({ customerName: name ?? null });
  await graph(token, `/users/${TICKET_MAILBOX_ENCODED}/sendMail`, {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject: built.subject,
        body: { contentType: "HTML", content: built.html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });
}
