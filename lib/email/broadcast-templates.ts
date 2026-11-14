import type { BroadcastContent, BroadcastKind } from "./broadcast-email";

/**
 * Starting points, not finished emails.
 *
 * Every one of these is a real thing this business has had to tell customers
 * - a circuit down, a maintenance window, a price change - written the way
 * you'd want it written at the moment you need it, which is usually the
 * moment you have least time to write it. The sender edits before sending;
 * the square brackets are there to be impossible to miss if they don't.
 *
 * They are deliberately specific. A template that says "Dear valued customer,
 * we are experiencing an issue" saves nobody any work.
 */

export interface BroadcastTemplate {
  id: string;
  label: string;
  /** What it's for, shown under the name when picking. */
  description: string;
  kind: BroadcastKind;
  subject: string;
  content: BroadcastContent;
}

export const BROADCAST_TEMPLATES: BroadcastTemplate[] = [
  {
    id: "outage",
    label: "Service outage",
    description: "Something is down now. Say what, where, and when you'll next say something.",
    kind: "outage",
    subject: "Service disruption affecting your [internet/phone] service",
    content: {
      kind: "outage",
      headline: "We're aware of an issue affecting your service",
      body: `We're currently seeing a disruption to [internet/phone] service in the [area] area, and your account may be affected.

Our engineers are working with the upstream provider to restore service as quickly as possible. You don't need to do anything or report the fault - we already have it.

We'll send an update as soon as we know more, and again when service is fully restored.`,
      details: [
        { label: "Service affected", value: "[Internet / Phone]" },
        { label: "Area", value: "[City or site]" },
        { label: "Started", value: "[Time]" },
        { label: "Next update", value: "[Time]" },
      ],
      cta: null,
    },
  },
  {
    id: "maintenance",
    label: "Planned maintenance",
    description: "Scheduled work with a known window. Send it a few days ahead.",
    kind: "maintenance",
    subject: "Planned maintenance on [date] - brief service interruption",
    content: {
      kind: "maintenance",
      headline: "Scheduled maintenance on your service",
      body: `We have maintenance planned that will briefly affect your [internet/phone] service.

We've scheduled it outside business hours to keep disruption to a minimum. Phones and internet may drop for a few minutes during the window while equipment restarts; no action is needed on your end.

If the work is cancelled or moved, we'll let you know beforehand.`,
      details: [
        { label: "Date", value: "[Day, date]" },
        { label: "Window", value: "[Start] - [End]" },
        { label: "Expected impact", value: "Short interruption, up to [N] minutes" },
      ],
      cta: null,
    },
  },
  {
    id: "restored",
    label: "Service restored",
    description: "The all-clear after an outage, with what caused it.",
    kind: "restored",
    subject: "Service restored",
    content: {
      kind: "restored",
      headline: "Your service is back to normal",
      body: `Service was fully restored at [time]. The cause was [brief cause], and it has been corrected.

Thank you for your patience while we worked through it. If anything still isn't working as it should - a phone that hasn't re-registered, or slower speeds than usual - reply to this email and we'll look at your site directly.`,
      details: [
        { label: "Restored", value: "[Time]" },
        { label: "Cause", value: "[Brief cause]" },
      ],
      cta: null,
    },
  },
  {
    id: "news",
    label: "News or update",
    description: "Anything worth telling customers that isn't an outage.",
    kind: "news",
    subject: "An update from Atlantis Utility",
    content: {
      kind: "news",
      headline: "[What's changing]",
      body: `We wanted to let you know about [what's changing] and what it means for your service.

[What it means for them, in a sentence or two. If nothing changes on their end, say so plainly - it's the thing they want to know.]

[When it takes effect, and who to contact with questions.]`,
      details: [],
      cta: null,
    },
  },
  {
    id: "promotion",
    label: "Offer or promotion",
    description: "A new service or upgrade, with a clear next step.",
    kind: "promotion",
    subject: "[Offer] for Atlantis Utility customers",
    content: {
      kind: "promotion",
      headline: "[The offer, in a few words]",
      body: `As an existing customer, you can now [what they get].

[What it costs, or what it saves them. Be specific - a number does more work here than a paragraph.]

[Who it suits, and anything they should know before taking it up.]`,
      details: [
        { label: "Offer ends", value: "[Date]" },
      ],
      cta: { label: "Talk to us about it", url: "mailto:ticket@atlantisutility.com" },
    },
  },
  {
    id: "custom",
    label: "Blank message",
    description: "Write your own, in the same house style.",
    kind: "custom",
    subject: "",
    content: { kind: "custom", headline: "", body: "", details: [], cta: null },
  },
];

export function templateById(id: string): BroadcastTemplate | undefined {
  return BROADCAST_TEMPLATES.find((t) => t.id === id);
}

/**
 * Anything still in square brackets, so nobody sends "[Time]" to 200
 * customers. Returns the placeholders it found, in the order they appear.
 */
export function unfilledPlaceholders(content: BroadcastContent, subject: string): string[] {
  const text = [
    subject,
    content.headline,
    content.body,
    ...content.details.flatMap((d) => [d.label, d.value]),
    content.cta?.label ?? "",
    content.cta?.url ?? "",
  ].join("\n");
  return [...new Set(text.match(/\[[^\]\n]{1,60}\]/g) ?? [])];
}
