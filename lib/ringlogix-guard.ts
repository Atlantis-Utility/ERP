import { NextResponse } from "next/server";
import { requireEmployee, ApiAuthError } from "./api-auth";

/**
 * Refuses a RingLogix read to anyone who isn't signed in as an employee.
 *
 * These routes proxy a reseller-scoped API user, so a single unguarded one
 * hands out every customer's numbers, call records and extensions to
 * whoever knows the URL - no login, no employee record, nothing. They were
 * open for as long as the API user couldn't read anything anyway; the
 * moment it could, that stopped being a theoretical hole.
 *
 * An employee rather than an administrator, deliberately: these are the
 * same reads the Customers page makes on every tab, and the people who
 * answer the phones need them.
 *
 * Returns the refusal to send back, or null when the caller is allowed.
 */
export async function denyUnlessEmployee(): Promise<NextResponse | null> {
  try {
    await requireEmployee();
    return null;
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
