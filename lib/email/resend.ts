const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL; // e.g. "Atlantis Utility <support@atlantisutility.com>"

export function isEmailConfigured(): boolean {
  return Boolean(RESEND_API_KEY && RESEND_FROM_EMAIL);
}

/** Resend takes at most this many messages in one batch call. */
const BATCH_LIMIT = 100;

/**
 * One message each to many people.
 *
 * Not a BCC: a single mail to two hundred customers shows every one of them
 * the others' addresses, and it can't greet anyone by name. The cost is
 * volume, which is what the batch endpoint is for - two hundred customers
 * is three calls rather than two hundred.
 *
 * Returns what failed rather than throwing, because the third chunk failing
 * does not un-send the first two, and whoever pressed the button needs to
 * know which of those happened.
 */
export async function sendEmailBatch(
  messages: Array<{ to: string; subject: string; html: string; replyTo?: string }>,
): Promise<{ sent: number; failures: Array<{ to: string; error: string }> }> {
  if (!isEmailConfigured()) throw new Error("EMAIL_NOT_CONFIGURED");

  let sent = 0;
  const failures: Array<{ to: string; error: string }> = [];

  for (let i = 0; i < messages.length; i += BATCH_LIMIT) {
    const chunk = messages.slice(i, i + BATCH_LIMIT);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
          // See sendEmail: a request with no User-Agent is refused with a
          // 401 that blames the API key.
          "User-Agent": "atlantis-erp",
        },
        body: JSON.stringify(
          chunk.map((m) => ({
            from: RESEND_FROM_EMAIL,
            to: [m.to],
            subject: m.subject,
            html: m.html,
            ...(m.replyTo ? { reply_to: m.replyTo } : {}),
          })),
        ),
        cache: "no-store",
      });
      if (!res.ok) {
        const text = (await res.text().catch(() => "")).slice(0, 200);
        for (const m of chunk) failures.push({ to: m.to, error: `${res.status}: ${text}` });
        continue;
      }
      sent += chunk.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : "send failed";
      for (const m of chunk) failures.push({ to: m.to, error: message });
    }
  }

  return { sent, failures };
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  /** Where a reply goes, when that should be a person rather than the sending address. */
  replyTo?: string;
}): Promise<void> {
  if (!isEmailConfigured()) throw new Error("EMAIL_NOT_CONFIGURED");

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      // Node's fetch sends no User-Agent by default. Resend's edge treats
      // UA-less requests as suspicious and rejects them with a misleading
      // "API key is invalid" 401 instead of the real reason — cost hours to
      // track down. A non-empty UA is all it takes.
      "User-Agent": "atlantis-erp",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend send failed ${res.status}: ${text.slice(0, 300)}`);
  }
}
