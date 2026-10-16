"use client";

import type { SharedKind } from "./email/access-email";

export type { SharedKind };

/**
 * "Let them know" after handing somebody something.
 *
 * Never throws: the share itself has already happened by the time this
 * runs, and failing to send a courtesy email is not a reason to tell
 * somebody their share didn't work. Returns a line to show, or "" when
 * there is nothing worth saying.
 */
export async function notifyAccessShared(opts: {
  toEmployeeId: string;
  toName?: string;
  kind: SharedKind;
  id: string;
  name: string;
  level?: string;
}): Promise<string> {
  try {
    const res = await fetch("/api/notify/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toEmployeeId: opts.toEmployeeId,
        kind: opts.kind,
        id: opts.id,
        name: opts.name,
        level: opts.level,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { sent?: boolean; error?: string };

    if (res.ok && data.sent) return `Emailed ${opts.toName ?? "them"}.`;
    if (res.ok) return ""; // sharing with yourself
    if (data.error === "EMAIL_NOT_CONFIGURED") return "Shared, but email isn't set up on this server.";
    if (data.error === "NO_EMAIL_ON_FILE") {
      return `Shared, but ${opts.toName ?? "they"} ${opts.toName ? "has" : "have"} no email address on file.`;
    }
    return "Shared, but the email couldn't be sent.";
  } catch {
    return "Shared, but the email couldn't be sent.";
  }
}
