import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Single shared instance for client components — mirrors the old
// `export const db` singleton from lib/firebase.ts so call sites don't
// need to change from `import { db } from "./firebase"`.
export const supabase = createClient();
