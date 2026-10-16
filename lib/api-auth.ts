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

export interface EmployeeActor {
  uid: string;
  email: string;
  employeeId: string;
  name: string;
}

/**
 * Verifies the caller is signed in and works here.
 *
 * Weaker than requireAdmin on purpose: a member shares their own note, so
 * the question is "do we employ you", not "do you run the place". Read with
 * the service key for the same reason as above - the answer must not depend
 * on what the caller can see.
 */
export async function requireEmployee(): Promise<EmployeeActor> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new ApiAuthError("Missing or invalid session", 401);

  const email = user.email ?? "";
  if (!email) throw new ApiAuthError("That account has no email address", 403);

  const admin = createServiceRoleClient();
  const { data: employee } = await admin
    .from("employees")
    .select("id, name")
    .ilike("email", email)
    .maybeSingle();
  if (!employee) throw new ApiAuthError("That account isn't an employee", 403);

  const row = employee as { id: string; name: string };
  return { uid: user.id, email, employeeId: row.id, name: row.name };
}
