import { NextRequest, NextResponse } from "next/server";
import { requireEmployee, ApiAuthError } from "@/lib/api-auth";
import { completeConnection, STATE_COOKIE } from "@/lib/microsoft/delegated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Back to the page they started from, with something to read. */
function back(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/account", req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.delete(STATE_COOKIE);
  return res;
}

/**
 * Where Microsoft sends the person after they sign in.
 *
 * Three things have to line up before a token is exchanged: they are signed
 * in here, the state matches the cookie we set, and the cookie was issued
 * to the same person now asking. The third is what stops somebody
 * completing a sign-in into a colleague's account on a shared machine.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  // Microsoft reports a refusal here rather than at the token endpoint:
  // a declined consent prompt, an unregistered redirect URI, a scope an
  // admin has to approve. Its description names the AADSTS code.
  const oauthError = searchParams.get("error");
  if (oauthError) {
    return back(req, {
      ms: "error",
      reason: (searchParams.get("error_description") ?? oauthError).split("\n")[0].slice(0, 300),
    });
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return back(req, { ms: "error", reason: "Microsoft didn't return a sign-in code." });

  try {
    const actor = await requireEmployee();

    const cookie = req.cookies.get(STATE_COOKIE)?.value ?? "";
    const [expectedState, startedBy] = cookie.split(":");
    if (!expectedState || expectedState !== state) {
      return back(req, { ms: "error", reason: "That sign-in didn't start here. Try connecting again." });
    }
    if (startedBy !== actor.email.toLowerCase()) {
      return back(req, { ms: "error", reason: "That sign-in was started by a different account." });
    }

    const connection = await completeConnection({
      email: actor.email,
      code,
      origin: req.nextUrl.origin,
    });
    return back(req, { ms: "connected", as: connection.microsoftUpn || connection.displayName });
  } catch (err) {
    if (err instanceof ApiAuthError) return back(req, { ms: "error", reason: err.message });
    return back(req, {
      ms: "error",
      reason: (err instanceof Error ? err.message : "Couldn't finish the connection").slice(0, 300),
    });
  }
}
