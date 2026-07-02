import Link from "next/link";
import { Home, Mail } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-12 h-12 rounded-xl bg-[#0a0a0a] flex items-center justify-center mx-auto mb-6">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L14 13H2L8 2Z" fill="white" fillOpacity="0.9" />
          </svg>
        </div>
        <p className="text-[80px] font-semibold text-[#eaeaea] leading-none mb-4">404</p>
        <h1 className="text-xl font-semibold text-[#0a0a0a] mb-2">Page not found</h1>
        <p className="text-sm text-[#666] mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-[#333] transition-colors w-full sm:w-auto justify-center"
          >
            <Home className="w-4 h-4" />
            Go to Home
          </Link>
          <a
            href="mailto:support@atlantisutility.com"
            className="inline-flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-5 py-2.5 rounded-lg hover:bg-[#fafafa] hover:border-[#ccc] transition-colors w-full sm:w-auto justify-center"
          >
            <Mail className="w-4 h-4" />
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}
