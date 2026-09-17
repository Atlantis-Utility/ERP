"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

/**
 * Asking before something irreversible, with the app's own dialog.
 *
 * The app had one, and nothing used it: seven destructive actions called
 * window.confirm instead, which shows the browser's own box with the domain
 * name at the top. The reason is shape, not taste, confirm() is synchronous
 * and a React dialog is declarative, so using the good one meant a piece of
 * state and a stored callback at every call site.
 *
 * So it's a promise here, and a call site reads almost the way it did:
 *
 *   if (!(await confirm({ title: "Delete this?", description: "…" }))) return;
 */

export interface ConfirmOptions {
  title: string;
  description: string;
  /** Defaults to "Delete", since that's what most of these ask. */
  confirmLabel?: string;
  variant?: "danger" | "warning";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface Pending {
  options: ConfirmOptions;
  resolve: (answer: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setPending((current) => {
          // A second ask while one is open shouldn't leave the first caller
          // waiting forever.
          current?.resolve(false);
          return { options, resolve };
        });
      }),
    [],
  );

  const settle = (answer: boolean) => {
    pending?.resolve(answer);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={pending !== null}
        title={pending?.options.title ?? ""}
        description={pending?.options.description ?? ""}
        confirmLabel={pending?.options.confirmLabel}
        variant={pending?.options.variant}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}

/**
 * Falls back to the browser's confirm when no provider is above, rather than
 * throwing: the answer still has to be asked for, and a component rendered
 * outside the shell shouldn't lose its guard over a missing context.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (ctx) return ctx;
  return async ({ title, description }) => window.confirm(`${title}\n\n${description}`);
}
