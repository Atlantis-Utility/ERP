"use client";

import { useState, useEffect } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Employee } from "../mock-data";

const COL = "employees";

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

export function subscribeEmployees(cb: (employees: Employee[]) => void) {
  return onSnapshot(
    query(collection(db, COL), orderBy("name")),
    (snap) => cb(snap.docs.map((d) => d.data() as Employee)),
    (err) => console.error("[employees]", err)
  );
}

export async function getAllEmployees(): Promise<Employee[]> {
  const snap = await getDocs(collection(db, COL));
  return snap.docs.map((d) => d.data() as Employee);
}

export async function addEmployee(emp: Employee): Promise<void> {
  await withTimeout(setDoc(doc(db, COL, emp.id), emp));
}

export async function updateEmployee(id: string, patch: Partial<Employee>): Promise<void> {
  await withTimeout(updateDoc(doc(db, COL, id), patch as Record<string, unknown>));
}

export async function removeEmployee(id: string): Promise<void> {
  await withTimeout(deleteDoc(doc(db, COL, id)));
}

/** React hook — returns a live-updated list of all employees. */
export function useEmployees(): Employee[] {
  const [list, setList] = useState<Employee[]>([]);
  useEffect(() => {
    const unsub = subscribeEmployees(setList);
    return unsub;
  }, []);
  return list;
}
