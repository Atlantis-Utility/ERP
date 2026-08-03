import { createClient } from "./supabase/server";

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

// Verifies the caller's Supabase session (via the request's cookies) and
// confirms their user_profiles row has is_admin === true. Unlike the
// client-side default (no profile yet => treated as admin, see
// auth-context.tsx), this requires an explicit profile with is_admin true —
// deliberately stricter for anything touching the password vault.
export async function requireAdmin(): Promise<AdminActor> {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new ApiAuthError("Missing or invalid session", 401);

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin, email")
    .eq("uid", user.id)
    .maybeSingle();

  if (!profile?.is_admin) throw new ApiAuthError("Admin access required", 403);

  return { uid: user.id, email: user.email ?? profile.email ?? "unknown" };
}
