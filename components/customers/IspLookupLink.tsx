"use client";

import { Radar } from "lucide-react";
import { useToast } from "@/lib/toast";

/**
 * "Who can serve this address?", one click away.
 *
 * ispreports.org takes an address and lists the providers at it, which is
 * the question somebody has open when they are filling in a customer's ISP.
 * The address can't be handed over in the URL - the site sits behind
 * Cloudflare and nothing about its form is reachable to check, let alone
 * script - so this does the next best thing: it copies the address and
 * opens the lookup, leaving one paste.
 *
 * The copy is deliberate rather than silent. Opening a blank search box
 * next to a customer whose address you then have to go back and find is
 * most of the annoyance.
 */
export const ISP_LOOKUP_URL = "https://ispreports.org/internet-providers-by-address/";

export default function IspLookupLink({
  address,
  label = "Find providers at this address",
  className = "",
}: {
  address: string;
  label?: string;
  className?: string;
}) {
  const { success, error } = useToast();

  async function open() {
    const trimmed = address.trim();
    if (trimmed) {
      try {
        await navigator.clipboard.writeText(trimmed);
        success("Address copied — paste it into the lookup.");
      } catch {
        // A browser that won't give us the clipboard is no reason not to
        // open the thing they asked for.
        error("Couldn't copy the address, but the lookup is open.");
      }
    }
    window.open(ISP_LOOKUP_URL, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      onClick={open}
      title={
        address.trim()
          ? `Copy "${address.trim()}" and open ispreports.org`
          : "Open ispreports.org (no address on file to copy)"
      }
      className={`flex items-center gap-1 text-[11px] font-medium text-[#0070f3] hover:underline ${className}`}
    >
      <Radar className="w-3 h-3" />
      {label}
    </button>
  );
}
