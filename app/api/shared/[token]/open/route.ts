import { createServiceRoleClient } from "@/lib/supabase/server";
import { VAULT_EXTERNAL_SHARES_TABLE } from "@/lib/vault-server";
import { hashShareToken, isPlausibleShareToken, recordShareEvent } from "@/lib/vault-external";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A transparent 1x1 GIF.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/**
 * The image at the bottom of an outside-link email. Loading it is how
 * "email opened" is known. It always answers with the image, found or
 * not, so a mail client never shows a broken picture, and it is never
 * cached, so a second opening is seen as one.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (isPlausibleShareToken(token)) {
    try {
      const supabase = createServiceRoleClient();
      const { data: share } = await supabase
        .from(VAULT_EXTERNAL_SHARES_TABLE)
        .select("id")
        .eq("token_hash", hashShareToken(token))
        .maybeSingle();
      if (share) await recordShareEvent(supabase, share.id as string, "email_opened", req);
    } catch (err) {
      console.error("[shared:open]", err);
    }
  }
  return new Response(new Uint8Array(PIXEL), {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Robots-Tag": "noindex",
    },
  });
}
