"use client";

import { useEffect } from "react";

// Each entry: the URL to fetch, the localStorage key to write, and how to extract the storable value.
// The extractor matches what each page's load() writes, so pages read their own format.
const PRELOAD: {
  url: string;
  key: string;
  extract: (json: unknown) => unknown;
}[] = [
  {
    url: "/api/ringlogix/customers",
    key: "sc:customers",
    extract: (d) => (Array.isArray(d) ? d : (d as Record<string, unknown>)?.data ?? []),
  },
  {
    url: "/api/ringlogix/billing",
    key: "sc:billing",
    extract: (d) => (Array.isArray(d) ? d : (d as Record<string, unknown>)?.data ?? []),
  },
  {
    url: "/api/ringlogix/dids",
    key: "sc:dids",
    extract: (d) => (Array.isArray(d) ? d : (d as Record<string, unknown>)?.data ?? []),
  },
  {
    url: "/api/ringlogix/cdr?limit=200",
    key: "sc:cdr",
    extract: (d) => (Array.isArray(d) ? d : (d as Record<string, unknown>)?.data ?? []),
  },
  {
    url: "/api/unifi/sites",
    key: "sc:sites",
    extract: (d) => (d as Record<string, unknown>)?.data ?? [],
  },
  {
    url: "/api/tickets",
    // tickets page stores the full { tickets, total, nextPageToken } object
    key: "tickets-cache-v1",
    extract: (d) => d,
  },
];

// How fresh is "fresh enough" — skip the network call if localStorage was written within this window
const FRESH_MS = 2 * 60_000; // 2 minutes

export default function DataPreloader() {
  useEffect(() => {
    // Small delay so the initial page render isn't competing with preload requests
    const timer = setTimeout(() => {
      for (const { url, key, extract } of PRELOAD) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const ts = localStorage.getItem(`${key}__ts`);
            if (ts && Date.now() - parseInt(ts) < FRESH_MS) continue; // already fresh
          }
        } catch {}

        // Fire-and-forget — we don't await, we don't block anything
        fetch(url)
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => {
            if (json == null) return;
            const value = extract(json);
            try {
              localStorage.setItem(key, JSON.stringify(value));
              localStorage.setItem(`${key}__ts`, String(Date.now()));
            } catch {}
          })
          .catch(() => {});
      }
    }, 800); // after initial render settles

    return () => clearTimeout(timer);
  }, []);

  return null;
}
