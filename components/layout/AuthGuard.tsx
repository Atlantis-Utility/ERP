"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NAV_PAGES } from "@/lib/nav-pages";

// `authUser.access` (undefined = unrestricted) is only used to hide sidebar
// links today, it never stopped someone from typing/bookmarking the URL
// directly. Gate the route itself so a revoked page actually becomes
// unreachable, not just invisible in the nav.
function isAllowed(pathname: string, access: string[] | undefined): boolean {
  if (!access) return true;
  // Longest matching href wins so "/employees/123" is gated by the
  // "/employees" grant rather than falling through unmatched.
  const page = NAV_PAGES
    .filter((p) => (p.href === "/" ? pathname === "/" : pathname === p.href || pathname.startsWith(`${p.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!page) return true; // not a gated page (e.g. /account)
  return access.includes(page.href);
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { authUser, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !authUser) router.replace("/login");
  }, [authUser, loading, router]);

  // Re-checked on every render, so this also fires the moment an admin
  // revokes access to the page the employee is currently sitting on.
  // authUser.access updates live (see auth-context's realtime subscription),
  // which re-runs this effect with the same pathname and kicks them out.
  useEffect(() => {
    if (!authUser) return;
    if (!isAllowed(pathname, authUser.access)) {
      const fallback = authUser.access && authUser.access.length > 0 ? authUser.access[0] : "/account";
      router.replace(fallback);
    }
  }, [authUser, pathname, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#fafafa]">
        <div className="w-5 h-5 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authUser) return null;
  if (!isAllowed(pathname, authUser.access)) return null;

  return <>{children}</>;
}
