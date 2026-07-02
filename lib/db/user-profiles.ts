"use client";

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";

export interface UserProfile {
  uid:        string;
  email:      string;
  displayName?: string;
  employeeId: string | null;
  isAdmin:    boolean;
  createdAt:  string;
}

const COL = "user_profiles";

/** Live listener for all user profiles (admin use only). */
export function subscribeUserProfiles(cb: (profiles: UserProfile[]) => void) {
  return onSnapshot(
    query(collection(db, COL), orderBy("createdAt")),
    (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile))),
    (err) => console.error("[user-profiles]", err)
  );
}

/** Set or update admin status for a user. */
export async function setUserAdmin(uid: string, isAdmin: boolean): Promise<void> {
  await updateDoc(doc(db, COL, uid), { isAdmin });
}

/** Ensure the current user's profile exists and has isAdmin: true. */
export async function ensureAdminProfile(uid: string, email: string): Promise<void> {
  await setDoc(
    doc(db, COL, uid),
    { uid, email, employeeId: null, isAdmin: true, createdAt: new Date().toISOString() },
    { merge: true }
  );
}
