const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL; // e.g. "Atlantis Utility <support@atlantisutility.com>"

export function isEmailConfigured(): boolean {
  return Boolean(RESEND_API_KEY && RESEND_FROM_EMAIL);
}

export async function sendEmail(opts: { to: string | string[]; subject: string; html: string }): Promise<void> {
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
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend send failed ${res.status}: ${text.slice(0, 300)}`);
  }
}
