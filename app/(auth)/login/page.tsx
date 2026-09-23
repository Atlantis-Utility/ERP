import { Suspense } from "react";
import LoginForm from "./LoginForm";
import { zohoConfigured } from "@/lib/zoho-auth";

/**
 * A server component, so which buttons exist is decided by what the server
 * is actually configured for rather than by a flag someone has to remember
 * to set. Zoho appears the moment ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET are
 * present; before that the button would only lead to an error page.
 *
 * PASSWORD_LOGIN=1 adds the email and password form underneath. Off by
 * default: Zoho covers the people outside the Microsoft tenant without
 * anybody having to store a password.
 */
// Rendered per request rather than baked at build time: which buttons
// exist is read from the environment, and a page frozen into the build
// would keep saying "no Zoho" until the next deploy, however many times
// the variables were set in the meantime.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-5 h-5 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm zohoEnabled={zohoConfigured()} passwordEnabled={process.env.PASSWORD_LOGIN === "1"} />
    </Suspense>
  );
}
