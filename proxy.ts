import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// NOTE: this project's Next.js version renamed Middleware to Proxy
// (see node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md) —
// this file replaces what would elsewhere be `middleware.ts`.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the session cookie (if expired) so Server Components always
  // see a valid session. Mirrors @supabase/ssr's standard session-refresh
  // pattern, just renamed for this Next version's proxy.ts convention.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only people on the Employees page get in, checked here as well as in
  // the browser. The client-side check signs a stranger out, but it runs
  // after their session exists and after the shell has started rendering;
  // this one answers before the page is served, on the server, where it
  // can't be skipped by disabling JavaScript or calling the route directly.
  //
  // The real prevention is the Before User Created hook in
  // supabase/migration-employees-only-login.sql, which stops the account
  // being created at all. This is the layer for accounts that already
  // exist, and for a deployment where that hook hasn't been switched on.
  if (user?.email && isGuardedPage(request)) {
    const { data: employee, error } = await supabase
      .from("employees")
      .select("id")
      .ilike("email", user.email)
      .maybeSingle();

    // Fail open on an error: a table that can't be reached right now is not
    // evidence that somebody doesn't work here, and locking everyone out
    // over a blip is the worse failure.
    if (!error && !employee) {
      const url = new URL("/login", request.url);
      url.searchParams.set("error", "not_an_employee");
      return NextResponse.redirect(url);
    }
  }

  return response;
}

/**
 * Whether this request is a page somebody is looking at, as opposed to the
 * sign-in pages themselves (redirecting those would loop), the auth
 * callbacks, or the app's own API routes, which do their own checking and
 * would otherwise pay for a lookup on every poll.
 */
function isGuardedPage(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/set-password") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/feedback/")
  ) {
    return false;
  }
  // Documents only. A navigation asks for HTML; the RSC payload fetches and
  // prefetches that follow it don't need the same question asked again.
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
