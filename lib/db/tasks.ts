"use client";

import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import type { KanbanCard } from "@/components/tasks/AddTaskDrawer";

const COL = "kanban_cards";

function withTimeout<T>(promise: Promise<T>, ms = 12_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Request timed out. Check your connection and try again.")),
        ms
      )
    ),
  ]);
}

export function subscribeTasks(cb: (cards: KanbanCard[]) => void) {
  return onSnapshot(
    query(collection(db, COL), orderBy("dueDate")),
    (snap) => cb(snap.docs.map((d) => d.data() as KanbanCard)),
    (err) => console.error("[tasks]", err)
  );
}

export async function addTask(card: KanbanCard): Promise<void> {
  await withTimeout(setDoc(doc(db, COL, card.id), card));
}

export async function updateTask(id: string, patch: Partial<KanbanCard>): Promise<void> {
  await withTimeout(updateDoc(doc(db, COL, id), patch as Record<string, unknown>));
}

export async function removeTask(id: string): Promise<void> {
  await withTimeout(deleteDoc(doc(db, COL, id)));
}
