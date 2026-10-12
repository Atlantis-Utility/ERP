"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Taking it back.
 *
 * A stack of steps that each know how to undo and redo themselves. The page
 * that performs an action is the only thing that knows how to reverse it -
 * what the values were before, which rows were touched - so it records that
 * at the moment it acts and hands the pair over.
 *
 * Only actions that can honestly be reversed go on here. Something that
 * can't be (a delete that cascades to notes and history) is left off
 * entirely rather than offered and then refused, and the buttons name the
 * step they would undo so there is never a question of what is about to
 * happen.
 *
 * The stack is per visit. It isn't persisted, because an undo written
 * against rows somebody else has since changed is a worse outcome than
 * having to put it right by hand.
 */
export interface UndoStep {
  /** What was done, as the button will say it: "moved 12 leads to Interested". */
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export interface UndoStack {
  record: (step: UndoStep) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  /** What the next undo would take back; null when there's nothing. */
  undoLabel: string | null;
  redoLabel: string | null;
  busy: boolean;
  clear: () => void;
}

/** Deep enough to cover a morning's work, shallow enough to stay honest. */
const LIMIT = 25;

export function useUndoStack(handlers?: {
  onDone?: (message: string) => void;
  onError?: (message: string) => void;
}): UndoStack {
  const [past, setPast] = useState<UndoStep[]>([]);
  const [future, setFuture] = useState<UndoStep[]>([]);
  const [busy, setBusy] = useState(false);
  // Held in a ref as well so the callbacks don't have to be rebuilt (and the
  // buttons re-bound) every time a step lands.
  const running = useRef(false);

  const record = useCallback((step: UndoStep) => {
    setPast((prev) => [...prev, step].slice(-LIMIT));
    // A new action makes the redo branch unreachable, which is what every
    // editor does and what people expect.
    setFuture([]);
  }, []);

  const run = useCallback(
    async (direction: "undo" | "redo") => {
      if (running.current) return;
      const from = direction === "undo" ? past : future;
      const step = from[from.length - 1];
      if (!step) return;

      running.current = true;
      setBusy(true);
      try {
        await (direction === "undo" ? step.undo() : step.redo());
        if (direction === "undo") {
          setPast((p) => p.slice(0, -1));
          setFuture((f) => [...f, step]);
          handlers?.onDone?.(`Undid: ${step.label}.`);
        } else {
          setFuture((f) => f.slice(0, -1));
          setPast((p) => [...p, step]);
          handlers?.onDone?.(`Redid: ${step.label}.`);
        }
      } catch (err) {
        // The step stays where it is, so it can be tried again once whatever
        // refused it is sorted out.
        handlers?.onError?.(
          err instanceof Error ? err.message : `Couldn't ${direction}: ${step.label}`,
        );
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [past, future, handlers],
  );

  const undo = useCallback(() => run("undo"), [run]);
  const redo = useCallback(() => run("redo"), [run]);

  const clear = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  return {
    record,
    undo,
    redo,
    undoLabel: past.length > 0 ? past[past.length - 1].label : null,
    redoLabel: future.length > 0 ? future[future.length - 1].label : null,
    busy,
    clear,
  };
}
