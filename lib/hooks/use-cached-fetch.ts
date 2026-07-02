"use client";

import { useState, useEffect, useCallback, useRef } from "react";

function readSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

function writeSession<T>(key: string, value: T) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function useCachedFetch<T>(
  cacheKey: string,
  url: string,
  pollMs?: number,
): { data: T | null; loading: boolean; error: string | null; refresh: () => Promise<void> } {
  const [data, setData]       = useState<T | null>(() => readSession<T>(cacheKey));
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const fetchNow = useCallback(async () => {
    try {
      const res  = await fetch(urlRef.current);
      const json = await res.json() as T;
      setData(json);
      setError(null);
      writeSession(cacheKey, json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [cacheKey]);

  useEffect(() => {
    // If we already have cached data, don't block the UI
    if (readSession(cacheKey)) setLoading(false);
    fetchNow();
    if (!pollMs) return;
    const iv = setInterval(fetchNow, pollMs);
    return () => clearInterval(iv);
  }, [fetchNow, cacheKey, pollMs]);

  return { data, loading, error, refresh: fetchNow };
}
