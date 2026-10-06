"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { firstAllowedPage, hasPageAccess } from "@/lib/nav-pages";
import NotFound from "@/app/not-found";

// `authUser.access` (undefined = unrestricted) is only used to hide sidebar
// links today, it never stopped someone from typing/bookmarking the URL
// directly. Gate the route itself so a revoked page actually becomes
// unreachable, not just invisible in the nav.
//
// The rule itself lives in lib/nav-pages.ts, because the UI needs the same
// answer to decide what to offer, and two copies of it would eventually
// disagree about a nested route.

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { authUser, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const landingDenied =
    !loading && Boolean(authUser) && pathname === "/" && !hasPageAccess("/", authUser?.access);
  const fallback = landingDenied ? firstAllowedPage(authUser?.access) : null;

  useEffect(() => {
    if (!loading && !authUser) router.replace("/login");
  }, [authUser, loading, router]);

  // The dashboard is a grantable page, and sign-in always lands on it.
  // Somebody granted only Leads was shown a 404 the moment they arrived,
  // which is indistinguishable from "I can't log in". Send them to the
  // first page they do hold instead. Only for "/" — a forbidden URL that
  // somebody typed or bookmarked still answers 404, which is the point of
  // answering 404 rather than redirecting.
  useEffect(() => {
    if (fallback && fallback !== "/") router.replace(fallback);
  }, [fallback, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#fafafa]">
        <div className="w-5 h-5 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authUser) return null;

  // A revoked/never-granted page renders as a genuine 404, not a redirect;
  // it shouldn't even confirm to the visitor that the route exists. Because
  // authUser.access updates live (auth-context's realtime subscription),
  // this also kicks in the moment an admin revokes access to the page an
  // employee is currently sitting on.
  if (!hasPageAccess(pathname, authUser.access)) {
    // Mid-redirect to a page they hold: a spinner, not a 404 that flashes
    // up for a moment and then vanishes.
    if (fallback && fallback !== "/") {
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#fafafa]">
          <div className="w-5 h-5 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    // Nothing granted at all. A 404 says "that page doesn't exist" to
    // somebody whose actual problem is that nobody has given them a page
    // yet, and leaves them with nowhere to go and nothing to read.
    if (firstAllowedPage(authUser.access) === null) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#fafafa] p-4">
          <div className="w-full max-w-sm bg-white border border-[#eaeaea] rounded-2xl p-8 shadow-sm text-center">
            <p className="text-base font-semibold text-[#0a0a0a] mb-1">You&apos;re signed in</p>
            <p className="text-sm text-[#666]">
              Nobody has given this account access to any pages yet. Ask an administrator to grant them on the
              Employees page.
            </p>
            <p className="text-[11px] text-[#bbb] mt-4">{authUser.email}</p>
            <button
              onClick={() => logout()}
              className="mt-5 w-full border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-4 py-2.5 rounded-lg hover:bg-[#fafafa] transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      );
    }
    return <NotFound />;
  }

  return <>{children}</>;
}
