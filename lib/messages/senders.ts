import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Which person sent a given outgoing text.
 *
 * RingLogix attributes a reply to the extension that owns the
 * conversation - necessarily, since that is what decides the number the
 * customer sees. With four people on one shared number, that makes every
 * reply look like it came from whoever happens to own the extension. The
 * ERP knows better: it knows who was signed in and pressed send.
 *
 * Written with the service role and read back by session, so nobody can
 * claim a message from the browser.
 */
const TABLE = "message_senders";

export async function recordSender(opts: {
  messageId: string;
  sessionId: string;
  name: string;
  email: string;
}): Promise<void> {
  if (!opts.messageId) return;
  try {
    await createServiceRoleClient().from(TABLE).upsert({
      message_id: opts.messageId,
      session_id: opts.sessionId,
      sent_by_name: opts.name,
      sent_by_email: opts.email,
      sent_at: new Date().toISOString(),
    });
  } catch {
    // The text has already gone. Losing the byline is a smaller problem
    // than failing a send that succeeded, so this never throws.
  }
}

/** message id -> the person who sent it, for one conversation. */
export async function sendersForSession(sessionId: string): Promise<Record<string, string>> {
  if (!sessionId) return {};
  try {
    const { data, error } = await createServiceRoleClient()
      .from(TABLE)
      .select("message_id, sent_by_name")
      .eq("session_id", sessionId);
    if (error || !data) return {};
    const out: Record<string, string> = {};
    for (const row of data as Array<{ message_id: string; sent_by_name: string }>) {
      if (row.sent_by_name) out[row.message_id] = row.sent_by_name;
    }
    return out;
  } catch {
    // Before the migration is applied this is simply empty, and every
    // message falls back to its extension's owner.
    return {};
  }
}
