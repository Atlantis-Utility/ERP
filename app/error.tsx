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
        <p className="text-sm text-[#666] mb-8">
          An unexpected error occurred. Try refreshing or go back to the dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-4 py-2.5 rounded-lg hover:bg-[#fafafa] transition-colors"
          >
            Try again
          </button>
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
