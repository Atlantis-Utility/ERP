import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Server-side client (Server Components, Route Handlers) — reads/writes the
 *  auth cookie via next/headers so the session survives across requests. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — proxy.ts refreshes the
            // session instead, so this is safe to ignore.
          }
        },
      },
    }
  );
}

/** Service-role client for privileged server-only operations (e.g. the
 *  migration script, admin user creation). Never import this from anything
 *  that ships to the client. */
export function createServiceRoleClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}
