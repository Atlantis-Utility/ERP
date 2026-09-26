import { createClient, createServiceRoleClient } from "./supabase/server";

export class ApiAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface AdminActor {
  uid: string;
  email: string;
}

/**
 * Verifies the caller's session and that they are actually an administrator.
 *
 * "Administrator" means the access role on their employee record, the one
 * the Employees page sets, and only falls back to user_profiles.is_admin
 * for a login with no employee record at all. That order matters:
 * user_profiles is writable by its owner (schema.sql's "update own profile
 * or admin" policy lets anyone update their own row), so trusting is_admin
 * first made every admin-only route reachable by anyone willing to send one
 * PostgREST request at themselves. The same rule as erp_is_admin() in SQL,
 * so the database and the API agree on who is an administrator.
 *
 * Read with the service key: the answer must not depend on what the caller
 * is allowed to see.
 */
export async function requireAdmin(): Promise<AdminActor> {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new ApiAuthError("Missing or invalid session", 401);

  const admin = createServiceRoleClient();
  const email = user.email ?? "";

  if (email) {
    const { data: employee } = await admin
      .from("employees")
      .select("data")
      .ilike("email", email)
      .maybeSingle();
    if (employee) {
      const role = (employee.data as { accessRole?: string } | null)?.accessRole;
      if (role !== "Administrator") throw new ApiAuthError("Admin access required", 403);
      return { uid: user.id, email };
    }
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("is_admin, email")
    .eq("uid", user.id)
    .maybeSingle();
  if (!profile?.is_admin) throw new ApiAuthError("Admin access required", 403);

  return { uid: user.id, email: email || profile.email || "unknown" };
}
