"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase/client";

export interface AuthUser {
  user: User;
  employeeId: string | null;
  isAdmin: boolean;
  displayName: string;
  email: string;
  employeeRole: string | null;
  employeeAccessRole: string | null;
  /** Allowed page hrefs for this employee — undefined means unrestricted (no linked employee record). */
  access: string[] | undefined;
}

interface AuthContextValue {
  authUser:              AuthUser | null;
  loading:               boolean;
  login:                 (email: string, password: string) => Promise<void>;
  loginWithMicrosoft:    () => Promise<void>;
  reverifyMicrosoftForVault: () => Promise<void>;
  logout:                () => Promise<void>;
  resetPassword:         (email: string) => Promise<void>;
  updateDisplayName:     (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function loadProfile(user: User) {
      // Keep loading true while we fetch the profile — prevents AuthGuard
      // from redirecting to /login during the async lookup.
      setLoading(true);

      let employeeId: string | null = null;
      let isAdmin = true;

      // user_profiles and employees (matched by email) don't depend on each
      // other, so fire both in parallel instead of waiting on one to resolve
      // before starting the next — halves the round-trip time on every load.
      const [profileResult, employeeByEmailResult] = await Promise.allSettled([
        supabase.from("user_profiles").select("employee_id, is_admin").eq("uid", user.id).maybeSingle(),
        supabase.from("employees").select("id, name, data").eq("email", user.email).maybeSingle(),
      ]);

      if (profileResult.status === "fulfilled" && profileResult.value.data) {
        const profile = profileResult.value.data;
        employeeId = profile.employee_id ?? null;
        isAdmin    = profile.is_admin    ?? !employeeId;
      } else if (profileResult.status === "fulfilled") {
        // First sign-in: create admin profile
        try {
          await supabase.from("user_profiles").insert({
            uid:          user.id,
            email:        user.email,
            display_name: user.user_metadata?.display_name ?? "",
            employee_id:  null,
            is_admin:     true,
          });
        } catch (err) {
          console.warn("[auth] profile insert failed:", err);
        }
        isAdmin = true;
      } else {
        // Profile table unreachable — let the user in as admin with
        // whatever we can derive from the Supabase Auth session.
        console.warn("[auth] profile fetch failed, proceeding with auth-only session:", profileResult.reason);
      }

      // Employees is the source of truth for a person's name/role. user_profiles.employee_id
      // may not be linked (e.g. admin accounts created before an employee record existed),
      // so the email-matched row above covers the common case. Only re-fetch when the
      // profile explicitly links to a different employee record than the email match.
      let employeeRow = employeeByEmailResult.status === "fulfilled" ? employeeByEmailResult.value.data : null;
      if (employeeId && employeeRow?.id !== employeeId) {
        try {
          const { data } = await supabase.from("employees").select("id, name, data").eq("id", employeeId).maybeSingle();
          employeeRow = data ?? employeeRow;
        } catch (err) {
          console.warn("[auth] employee lookup by id failed:", err);
        }
      }

      const employeeName = employeeRow?.name ?? null;
      const employeeExtra = employeeRow?.data as { role?: string; accessRole?: string; access?: string[] } | undefined;

      const displayName = user.user_metadata?.display_name || employeeName || user.email?.split("@")[0] || "User";
      if (employeeId) {
        localStorage.setItem("current_user_id", employeeId);
      } else {
        localStorage.removeItem("current_user_id");
      }
      localStorage.setItem("current_user_name", displayName);

      setAuthUser({
        user,
        employeeId,
        isAdmin,
        displayName,
        email:              user.email ?? "",
        employeeRole:       employeeExtra?.role ?? null,
        employeeAccessRole: employeeExtra?.accessRole ?? null,
        // Only linked employee records are access-restricted — an admin account
        // with no employee row (e.g. the bootstrap admin) stays unrestricted.
        access:             employeeId ? (employeeExtra?.access ?? []) : undefined,
      });
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadProfile(session.user);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) {
        setAuthUser(null);
        localStorage.removeItem("current_user_id");
        setLoading(false);
        return;
      }

      // Silently connect Outlook Calendar right after a genuine sign-in (not
      // on every page load / session restore, which fires "INITIAL_SESSION"
      // instead). First time, Microsoft may show a one-time consent screen;
      // after that it's silent since the user already granted access.
      if (event === "SIGNED_IN") {
        try {
          if (!document.cookie.includes("outlook_connected=1")) {
            setTimeout(() => { window.location.href = "/api/outlook-calendar/connect"; }, 800);
          }
        } catch {}
      }

      loadProfile(session.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Keep page-access permissions live for the whole session — if an admin changes
  // this employee's access while they're logged in, it takes effect immediately
  // instead of requiring them to log out and back in.
  const employeeId = authUser?.employeeId ?? null;
  useEffect(() => {
    if (!employeeId) return;
    const channel = supabase
      .channel(`auth-employee-${employeeId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "employees", filter: `id=eq.${employeeId}` },
        (payload) => {
          const row = payload.new as { data?: { access?: string[]; role?: string; accessRole?: string } } | undefined;
          if (!row) return;
          setAuthUser((prev) =>
            prev ? {
              ...prev,
              access:             row.data?.access ?? [],
              employeeRole:       row.data?.role ?? prev.employeeRole,
              employeeAccessRole: row.data?.accessRole ?? prev.employeeAccessRole,
            } : prev
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [employeeId]);

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function loginWithMicrosoft() {
    // Redirect-based (Supabase OAuth doesn't support popup sign-in like
    // Firebase's signInWithPopup did). Account linking for an email that
    // already has a password-based account is handled by Supabase natively
    // (Authentication → Providers settings), not client-side special-casing.
    // Requests calendar access as part of this same OAuth grant (Supabase's
    // documented pattern for accessing provider tokens — see GoTrueClient's
    // signInWithOAuth scopes option) so Microsoft returns a Calendars.Read
    // refresh token directly to app/auth/callback/route.ts. That means no
    // separate consent screen for calendar sync — see that route for where
    // the token is captured and stored.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email offline_access Calendars.Read",
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
  }

  // Vault "set up your passkey" (first time) and "forgot passkey" both
  // require re-proving control of the employee's Microsoft account first —
  // neither can be gated by "knows the current passkey". This leaves the
  // page (full OAuth redirect, same as loginWithMicrosoft) and comes back to
  // /vault; /auth/callback stamps a short-lived verification the passkey
  // set/reset endpoint checks for.
  async function reverifyMicrosoftForVault() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email offline_access Calendars.Read",
        redirectTo: `${window.location.origin}/auth/callback?vault_verify=1&next=${encodeURIComponent("/vault?ms_verified=1")}`,
      },
    });
    if (error) throw error;
  }

  async function logout() {
    localStorage.removeItem("current_user_id");
    localStorage.removeItem("current_user_name");
    await supabase.auth.signOut();
  }

  async function resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  }

  async function updateDisplayName(name: string) {
    const { error } = await supabase.auth.updateUser({ data: { display_name: name } });
    if (error) throw error;
    localStorage.setItem("current_user_name", name);
    setAuthUser((prev) => prev ? { ...prev, displayName: name } : prev);
  }

  return (
    <AuthContext.Provider value={{ authUser, loading, login, loginWithMicrosoft, reverifyMicrosoftForVault, logout, resetPassword, updateDisplayName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
