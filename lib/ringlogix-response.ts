import { NextResponse } from "next/server";
import { RingLogixError } from "./ringlogix";

/**
 * The API's object names, in the words the app uses for them. "callqueue"
 * and "mac" are RingLogix's keys, not anything somebody reading an error
 * should have to decode.
 */
const WHAT: Record<string, string> = {
  phonenumber: "phone numbers",
  subscriber: "extensions",
  callqueue: "call queues",
  mac: "the device inventory",
  device: "registered devices",
  domain: "customers",
  reseller_client: "billing",
  cdr2: "call records",
};

/**
 * One answer for every RingLogix route, so a refusal reads the same
 * wherever it surfaces.
 *
 * Every one of these routes used to turn any failure into a 500 carrying
 * the message, which meant the UI could only ever say "Failed to load" and
 * offer a Retry. A permissions failure is not that: it will answer the same
 * way forever, and the fix is in the RingLogix portal, not in a button.
 *
 * So a denial gets its own status and a stable code the client can switch
 * on, with the provider's own words alongside it for whoever has to go and
 * fix the account.
 */
export function ringlogixFailure(err: unknown): NextResponse {
  if (err instanceof RingLogixError && err.denied) {
    const what = WHAT[err.object] ?? err.object;
    return NextResponse.json(
      {
        error: "no_api_access",
        reason: err.reason,
        object: err.object,
        message: `The API user isn't allowed to read ${what}${err.reason ? ` — ${err.reason}` : ""}.`,
      },
      { status: 403 },
    );
  }
  const message = err instanceof Error ? err.message : String(err);

  // Never got as far as asking for anything: the token itself was refused.
  //
  // Same class of problem as a denial - it will answer the same way until
  // somebody changes a credential - so it gets the same calm panel rather
  // than a 500 and a Retry button that cannot work. The distinction below
  // is the one worth making: RingLogix blames the application for one and
  // the user for the other, and they are fixed in different places.
  if (message.startsWith("RingLogix auth failed")) {
    const badClient = /invalid_client/i.test(message);
    return NextResponse.json(
      {
        error: "no_api_access",
        reason: message.replace(/^RingLogix auth failed \d+: /, ""),
        object: "token",
        message: badClient
          ? "RingLogix rejected the API application itself - check RINGLOGIX_API_ID and RINGLOGIX_API_SECRET against the API credentials in the portal."
          : "RingLogix rejected the API user's login - check RINGLOGIX_USERNAME and RINGLOGIX_PASSWORD.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json({ error: message || "Unknown error" }, { status: 500 });
}
