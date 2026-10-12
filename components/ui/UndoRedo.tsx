"use client";

import { Undo2, Redo2, Loader2 } from "lucide-react";
import type { UndoStack } from "@/lib/use-undo";

/**
 * The pair of buttons. Each one names the step it would take back, because
 * "undo" on its own is a question rather than an offer - on a page where a
 * click can move hundreds of rows, you want to know which click.
 */
export default function UndoRedo({ stack }: { stack: UndoStack }) {
  const base =
    "flex items-center justify-center w-8 h-8 rounded-md border border-[#eaeaea] bg-white text-[#666] transition-colors hover:bg-[#fafafa] hover:text-[#0a0a0a] disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-[#666]";

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={stack.undo}
        disabled={!stack.undoLabel || stack.busy}
        title={stack.undoLabel ? `Undo: ${stack.undoLabel}` : "Nothing to undo"}
        aria-label={stack.undoLabel ? `Undo: ${stack.undoLabel}` : "Nothing to undo"}
        className={base}
      >
        {stack.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
      </button>
      <button
        onClick={stack.redo}
        disabled={!stack.redoLabel || stack.busy}
        title={stack.redoLabel ? `Redo: ${stack.redoLabel}` : "Nothing to redo"}
        aria-label={stack.redoLabel ? `Redo: ${stack.redoLabel}` : "Nothing to redo"}
        className={base}
      >
        <Redo2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
