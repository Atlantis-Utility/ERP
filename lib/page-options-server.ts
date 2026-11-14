import { createClient, createServiceRoleClient } from "./supabase/server";
import { defaultPageOptions, hasPageOption } from "./page-options";

/**
 * Does the caller hold this page option? (lib/page-options.ts)
 *
 * A hidden table column is not a permission — the response still carried the
 * numbers, and anyone could read them off the network tab or curl the route
 * with their own cookie. So the routes that serve money strip it here
 * instead, and the UI gating is only there to avoid showing an empty column.
 *
 * Resolved the same way as requireAdmin: the employee row found by email,
 * falling back to user_profiles only for a login with no employee record at
 * all. Read with the service key, because the answer must not depend on what
 * the caller is allowed to see.
 *
 * An administrator holds every option until somebody records otherwise on
 * their row - and then the row wins, so an administrator who turned their
 * own billing off is served the same data as the people they turned it off
 * for. A permission you can't test on yourself isn't one you can trust.
 *
 * Fails closed. No session, no employee, a table that won't answer — all of
 * them mean "not granted", because the cost of being wrong here is handing
 * somebody the balances.
 */
export async function callerHasPageOption(key: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email;
    if (!email) return false;

    const admin = createServiceRoleClient();
    const { data: employee } = await admin
      .from("employees")
      .select("data")
      .ilike("email", email)
      .maybeSingle();

    if (employee) {
      const row = employee.data as { accessRole?: string; pageOptions?: string[] } | null;
      return hasPageOption(key, {
        pageOptions: row?.pageOptions ?? defaultPageOptions(row?.accessRole === "Administrator"),
      });
    }

    // Bootstrap admin: a login with no employee record behind it, which
    // auth-context also treats as unrestricted.
    const { data: profile } = await admin
      .from("user_profiles")
      .select("is_admin")
      .eq("uid", user.id)
      .maybeSingle();
    return profile?.is_admin === true;
  } catch (err) {
    console.warn("[page-options] couldn't resolve", key, err);
    return false;
  }
}
