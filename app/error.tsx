"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-12 h-12 rounded-xl bg-[#0a0a0a] flex items-center justify-center mx-auto mb-6">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L14 13H2L8 2Z" fill="white" fillOpacity="0.9" />
          </svg>
        </div>
        <p className="text-[80px] font-semibold text-[#eaeaea] leading-none mb-4">500</p>
        <h1 className="text-xl font-semibold text-[#0a0a0a] mb-2">Something went wrong</h1>
        <p className="text-sm text-[#666] mb-6">
          An unexpected error occurred. Reload the page, or go back to the dashboard.
        </p>

        {/* What actually failed. Without this the page is unreportable: the
            only copy of the error is in a console nobody has open, so "it
            shows 500" is all anyone can say about it. The digest is what
            matches a client error to its server-side log entry. */}
        {error.message && (
          <p className="text-left text-[11px] font-mono text-[#946c00] bg-[#fefce8] border border-[#f7e6a8] rounded-lg px-3 py-2 mb-6 break-words">
            {error.message}
            {error.digest && <span className="block text-[#bbb] mt-1">digest {error.digest}</span>}
          </p>
        )}

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={reset}
            className="border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-4 py-2.5 rounded-lg hover:bg-[#fafafa] transition-colors"
          >
            Try again
          </button>
          {/* Distinct from "Try again", which re-renders the same tree from
              the same JavaScript. A reload refetches it, which is the fix when
              the running bundle is the problem: a tab left open across a
              deploy holds chunks that no longer match the server. */}
          <button
            onClick={() => window.location.reload()}
            className="border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-4 py-2.5 rounded-lg hover:bg-[#fafafa] transition-colors"
          >
            Reload
          </button>
          {/* A plain anchor, not <Link>: this is the error boundary, so a
              client-side navigation would keep the broken React tree that got
              us here. A full document load is the point. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="bg-[#0a0a0a] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-[#333] transition-colors"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
