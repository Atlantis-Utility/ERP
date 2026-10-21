import type { Metadata } from "next";

// The page a credential link opens. Kept out of search results, and told
// not to send its address (which carries the token) to any site it links to.
export const metadata: Metadata = {
  title: "Shared login details · Atlantis Utility",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#fafafa] flex flex-col items-center px-4 py-10 sm:py-16">{children}</div>;
}
