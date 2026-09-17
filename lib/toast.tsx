"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, AlertCircle, Info, X } from "lucide-react";

/**
 * Transient messages, top right.
 *
 * Pages used to report the result of an action inline, pushing a green or red
 * bar in above the content. That moves everything down at the moment you're
 * reading it, it's easy to miss when the action was taken further down the
 * page, and it lingers until something clears it. A toast says what happened
 * where the eye expects it and then leaves.
 *
 * Deliberately small: no queue limits, no positions, no promise helpers.
 * Three kinds and a duration is the whole surface.
 */

export type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void;
  /** Convenience for the two common cases, so call sites read as intent. */
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

// An error stays longer: it's usually something to act on, and often longer
// to read than "Saved".
const DURATION: Record<ToastKind, number> = { success: 4000, info: 5000, error: 8000 };

const STYLES: Record<ToastKind, { ring: string; icon: string; Icon: typeof Check }> = {
  success: { ring: "border-[#bbf7d0]", icon: "text-[#17c964]", Icon: Check },
  error: { ring: "border-[#fecdd3]", icon: "text-[#f31260]", Icon: AlertCircle },
  info: { ring: "border-[#eaeaea]", icon: "text-[#666]", Icon: Info },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "success") => {
      if (!message) return;
      // Date.now alone collides when two land in the same millisecond, which
      // a bulk action does routinely.
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), DURATION[kind]);
    },
    [],
  );

  const api: ToastApi = {
    toast,
    success: useCallback((m: string) => toast(m, "success"), [toast]),
    error: useCallback((m: string) => toast(m, "error"), [toast]),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 &&
        createPortal(
          // Top right, below the header, and out of the way of clicks it
          // isn't the target of.
          <div className="fixed top-4 right-4 z-[300] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-2rem)] sm:max-w-sm">
            {toasts.map((t) => {
              const style = STYLES[t.kind];
              return (
                <div
                  key={t.id}
                  role="status"
                  className={`pointer-events-auto flex items-start gap-2.5 bg-white border ${style.ring} rounded-lg shadow-lg px-3.5 py-3 animate-[toast-in_140ms_ease-out]`}
                >
                  <style.Icon className={`w-4 h-4 shrink-0 mt-0.5 ${style.icon}`} />
                  <p className="text-[13px] text-[#0a0a0a] leading-snug flex-1 wrap-break-word">{t.message}</p>
                  <button
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss"
                    className="shrink-0 p-0.5 rounded text-[#bbb] hover:text-[#666] hover:bg-[#f5f5f5] transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

/**
 * Never throws when the provider is missing: a message is feedback, not a
 * feature, and a component rendered outside the shell shouldn't crash over
 * one. It logs instead, so the case is visible in development.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  const fallback = (message: string, kind: ToastKind = "success") =>
    console.warn(`[toast:${kind}] ${message} (no ToastProvider above this component)`);
  return {
    toast: fallback,
    success: (m) => fallback(m, "success"),
    error: (m) => fallback(m, "error"),
  };
}
