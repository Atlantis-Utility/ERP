import { getGraphToken, TICKET_MAILBOX_ENCODED } from "@/app/api/tickets/_ms-auth";
import { buildTicketAcknowledgementEmail } from "@/lib/email/ticket-acknowledgement-email";
import { createServiceRoleClient } from "@/lib/supabase/server";

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
 * Headers that mean "this was sent to a list, not to us".
 *
 * A newsletter, an invoice notice or a regulatory bulletin is not a ticket,
 * and nobody at the other end is waiting to hear that a representative will
 * be in touch. The sender address doesn't always say so - a dry run over a
 * fortnight of real mail caught a CPUC broadband notice from an ordinary
 * ca.gov address, which the no-reply pattern can't see - but bulk mail
 * carries these, because unsubscribe links and auto-submitted markers are
 * how bulk mail is supposed to identify itself.
 */
const BULK_HEADERS = new Set([
  "list-unsubscribe", "list-id", "list-post", "list-help", "list-subscribe",
  "x-campaign-id", "x-mailgun-sid", "feedback-id", "x-csa-complaints",
]);

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
  /** Which folder the copy lives in - Sent Items is how we recognise our own. */
  parentFolderId?: string;
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

/**
 * Is this message one of ours?
 *
 * Three ways it can be, and all three matter:
 *
 *  - an SMTP address at our domain - a colleague answering from their own
 *    account, which is how this desk actually replies;
 *  - a message sitting in the mailbox's Sent Items - our own reply, by
 *    where it is rather than who it says it's from;
 *  - a sender in Exchange's X500 form (`/o=ExchangeLabs/ou=.../cn=...`),
 *    which is what Graph returns for our own sent copy instead of
 *    ticket@atlantisutility.com. Only a sender inside this tenant is
 *    written that way, and a sender inside this tenant is us.
 *
 * The X500 case is the one that bites: without it the acknowledgement we
 * sent is invisible to this check, and every reply from the customer earns
 * them another one.
 */
export function isOurMessage(
  address: string,
  parentFolderId?: string | null,
  sentFolderId?: string | null,
): boolean {
  const a = address.toLowerCase();
  if (a.endsWith(`@${OUR_DOMAIN}`)) return true;
  if (a.startsWith("/o=")) return true;
  return Boolean(sentFolderId && parentFolderId === sentFolderId);
}

const isOurs = (address: string) => isOurMessage(address);

/**
 * The threads we have already replied to, as a row we hold ourselves.
 *
 * The real check is the thread itself - a conversation containing a message
 * from us is answered - and it is a good check. What it cannot do is settle
 * a race: two sweeps running at the same moment (two instances, two people
 * opening Tickets) both ask Graph, both are told the thread is unanswered,
 * and both reply. The throttle in app/api/tickets/route.ts is per instance
 * and doesn't help across them, and Graph takes a moment to show a sent
 * message anyway.
 *
 * A primary key does settle it. Whoever inserts the row first sends; the
 * other is told the row exists and stops. The claim is taken immediately
 * before sending and released if the send fails, so a failure is retried
 * rather than silently marked done.
 *
 * Requires supabase/migration-ticket-acknowledgements.sql. Without the
 * table this degrades to the Graph check alone rather than falling silent:
 * one acknowledgement too many is bad, none at all is worse.
 */
const LEDGER_TABLE = "ticket_acknowledgements";

type Claim = "claimed" | "already-sent" | "no-ledger";

async function claimThread(c: AcknowledgementCandidate): Promise<Claim> {
  try {
    const { error } = await createServiceRoleClient().from(LEDGER_TABLE).insert({
      conversation_id: c.conversationId,
      to_address: c.to,
      subject: c.subject,
      message_id: c.messageId,
    });
    if (!error) return "claimed";
    // 23505: somebody else holds the row - they are sending it, we are not.
    if (error.code === "23505") return "already-sent";
    console.warn("[ticket-ack] ledger unavailable, falling back to the thread check:", error.message);
    return "no-ledger";
  } catch (err) {
    console.warn("[ticket-ack] ledger unavailable:", err instanceof Error ? err.message : err);
    return "no-ledger";
  }
}

/** A claim for a send that never happened, so the next run can try again. */
async function releaseThread(conversationId: string): Promise<void> {
  try {
    await createServiceRoleClient().from(LEDGER_TABLE).delete().eq("conversation_id", conversationId);
  } catch {
    // Left behind, this thread goes unacknowledged. That is the safe way
    // round, and the ticket is still in the list for a person to answer.
  }
}

/**
 * Whether this message is bulk mail, and which header said so.
 *
 * Read per candidate rather than for the whole inbox: by the time a message
 * gets here it has passed every other test, which on a normal run is none
 * of them or one.
 */
async function bulkMailHeader(token: string, messageId: string): Promise<string | null> {
  try {
    const m = await graph<{ internetMessageHeaders?: Array<{ name?: string; value?: string }> }>(
      token,
      `/users/${TICKET_MAILBOX_ENCODED}/messages/${messageId}?$select=internetMessageHeaders`,
    );
    for (const h of m.internetMessageHeaders ?? []) {
      const name = (h.name ?? "").toLowerCase();
      const value = (h.value ?? "").trim().toLowerCase();
      if (BULK_HEADERS.has(name)) return h.name ?? name;
      if (name === "precedence" && /^(bulk|list|junk)/.test(value)) return `Precedence: ${value}`;
      // RFC 3834: anything but "no" means a machine sent it.
      if (name === "auto-submitted" && value && value !== "no") return `Auto-Submitted: ${value}`;
    }
    return null;
  } catch (err) {
    // Unreadable headers are not grounds to stay silent - every other
    // test has already passed, and a real ticket would go unanswered.
    console.warn("[ticket-ack] couldn't read headers:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** The mailbox's Sent Items, looked up once per run and remembered. */
let sentFolderCache: { id: string; at: number } | null = null;

async function sentItemsFolderId(token: string): Promise<string | null> {
  if (sentFolderCache && Date.now() - sentFolderCache.at < 3_600_000) return sentFolderCache.id;
  try {
    const folder = await graph<{ id: string }>(
      token,
      `/users/${TICKET_MAILBOX_ENCODED}/mailFolders/sentitems?$select=id`,
    );
    sentFolderCache = { id: folder.id, at: Date.now() };
    return folder.id;
  } catch (err) {
    // Not fatal: the sender test still catches our domain and the X500
    // form. Worth knowing about, though - this is the precise check.
    console.warn("[ticket-ack] couldn't resolve Sent Items:", err);
    return null;
  }
}

/**
 * Everything in the conversation, across every folder — their messages,
 * our replies in Sent Items, and anything a colleague sent from their own
 * account. Staff here answer from their personal addresses with the shared
 * mailbox on the thread, so "have we replied" cannot be "is there a message
 * from the ticket mailbox".
 */
async function conversationMessages(
  token: string,
  conversationId: string,
): Promise<Array<{ address: string; folder: string }>> {
  // Single quotes inside an OData string literal are escaped by doubling.
  const literal = encodeURIComponent(conversationId.replace(/'/g, "''"));
  const data = await graph<{ value?: GraphMessage[] }>(
    token,
    `/users/${TICKET_MAILBOX_ENCODED}/messages?$filter=conversationId eq '${literal}'&$select=from,receivedDateTime,parentFolderId&$top=100`,
  );
  return (data.value ?? []).map((m) => ({
    address: m.from?.emailAddress?.address ?? "",
    folder: m.parentFolderId ?? "",
  }));
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

  const sentFolder = await sentItemsFolderId(token);
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
    // if anybody here has sent into this thread, it is answered - including
    // us, so a customer replying to their own ticket four times gets one
    // acknowledgement, not four.
    const thread = await conversationMessages(token, m.conversationId);
    const ours = thread.filter((x) => isOurMessage(x.address, x.folder, sentFolder));
    if (ours.length > 0) {
      // Ours and nobody else's means the only thing in there is the
      // acknowledgement; a colleague's reply is worth saying differently.
      const onlyTheRobot = ours.every(
        (x) => x.folder === sentFolder || x.address.toLowerCase() === MAILBOX || x.address.startsWith("/o="),
      );
      skip(onlyTheRobot ? "already acknowledged" : "already answered by a person");
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

    // A newsletter, a notice, an invoice: addressed to a list, not to us.
    const bulk = await bulkMailHeader(token, m.id);
    if (bulk) { skip(`bulk mail (${bulk})`); continue; }

    if (dryRun) {
      result.acknowledged.push(candidate);
      continue;
    }

    // Last thing before sending, so two sweeps can't both decide to.
    const claim = await claimThread(candidate);
    if (claim === "already-sent") { skip("already acknowledged (another run has it)"); continue; }

    const { html } = buildTicketAcknowledgementEmail({ customerName: candidate.toName });
    try {
      await replyInThread(token, m.id, html);
      result.acknowledged.push(candidate);
      console.log(`[ticket-ack] acknowledged ${from} — "${candidate.subject}"`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[ticket-ack] failed for ${from}:`, reason);
      if (claim === "claimed") await releaseThread(candidate.conversationId);
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
