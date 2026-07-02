"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export interface AuthUser {
  firebaseUser: User;
  employeeId: string | null;
  isAdmin: boolean;
  displayName: string;
  email: string;
}

interface AuthContextValue {
  authUser:            AuthUser | null;
  loading:             boolean;
  login:               (email: string, password: string) => Promise<void>;
  loginWithGoogle:     () => Promise<void>;
  logout:              () => Promise<void>;
  resetPassword:       (email: string) => Promise<void>;
  updateDisplayName:   (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setAuthUser(null);
        localStorage.removeItem("current_user_id");
        setLoading(false);
        return;
      }

      // Keep loading true while we fetch the profile — prevents AuthGuard
      // from redirecting to /login during the async Firestore lookup.
      setLoading(true);

      let employeeId: string | null = null;
      let isAdmin = true;

      try {
        const profileRef  = doc(db, "user_profiles", firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
          const data = profileSnap.data();
          employeeId = data.employeeId ?? null;
          isAdmin    = data.isAdmin    ?? !employeeId;
        } else {
          // First sign-in: create admin profile
          await setDoc(profileRef, {
            uid:        firebaseUser.uid,
            email:      firebaseUser.email,
            displayName: firebaseUser.displayName ?? "",
            employeeId: null,
            isAdmin:    true,
            createdAt:  new Date().toISOString(),
          });
          isAdmin = true;
        }
      } catch (err) {
        // Firestore offline or unavailable — let the user in as admin
        // with whatever we can derive from the Firebase Auth token.
        console.warn("[auth] Firestore profile fetch failed, proceeding with auth-only session:", err);
      }

      // Keep backward-compat with localStorage-based code
      const displayName = firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Admin";
      if (employeeId) {
        localStorage.setItem("current_user_id", employeeId);
      } else {
        localStorage.removeItem("current_user_id");
      }
      localStorage.setItem("current_user_name", displayName);

      setAuthUser({
        firebaseUser,
        employeeId,
        isAdmin,
        displayName: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "User",
        email:       firebaseUser.email ?? "",
      });
      setLoading(false);
    });

    return unsub;
  }, []);

  async function login(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }

  async function logout() {
    localStorage.removeItem("current_user_id");
    localStorage.removeItem("current_user_name");
    await signOut(auth);
  }

  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  async function updateDisplayName(name: string) {
    if (!auth.currentUser) throw new Error("Not signed in");
    await updateProfile(auth.currentUser, { displayName: name });
    localStorage.setItem("current_user_name", name);
    setAuthUser((prev) => prev ? { ...prev, displayName: name } : prev);
  }

  return (
    <AuthContext.Provider value={{ authUser, loading, login, loginWithGoogle, logout, resetPassword, updateDisplayName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
