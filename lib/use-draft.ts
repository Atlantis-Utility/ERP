"use client";

import { useEffect, useRef, useState } from "react";

// Persists a piece of in-progress form state to localStorage (debounced),
// so switching browser tabs (or the tab getting backgrounded/discarded, or
// an accidental refresh) doesn't wipe out something like a half-filled
// Add Lead form or an in-progress note. Restores automatically the next
// time the same draft key is opened. Call the returned `clearDraft()` once
// the data has actually been saved, or the user explicitly discards it, so
// a stale draft doesn't resurface later.
export function useDraft<T>(key: string, initial: T, delayMs = 400): [T, (value: T) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextWrite = useRef(true); // don't immediately re-write the value we just loaded

  useEffect(() => {
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage full or unavailable (private browsing), the draft safety
        // net is best-effort, not saving one isn't worth surfacing an error.
      }
    }, delayMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function clearDraft() {
    if (timer.current) clearTimeout(timer.current);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  return [value, setValue, clearDraft];
}
