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
import type { Project } from "../mock-projects";

const COL = "projects";

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

export function subscribeProjects(cb: (projects: Project[]) => void) {
  return onSnapshot(
    query(collection(db, COL), orderBy("name")),
    (snap) => cb(snap.docs.map((d) => d.data() as Project)),
    (err) => console.error("[projects]", err)
  );
}

function dropUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

export async function addProject(proj: Project): Promise<void> {
  await withTimeout(setDoc(doc(db, COL, proj.id), dropUndefined(proj)));
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  await withTimeout(updateDoc(doc(db, COL, id), dropUndefined(patch) as Record<string, unknown>));
}

export async function removeProject(id: string): Promise<void> {
  await withTimeout(deleteDoc(doc(db, COL, id)));
}
