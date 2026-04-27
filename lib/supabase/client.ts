"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

// ---------------------------------------------------------------------------
// iOS Safari PWA refresh-token backup
//
// iOS Safari periodically evicts localStorage for PWAs (low storage, iOS
// updates, ITP).  When localStorage is cleared, `getSession()` returns null
// and the user is forced to log in again.  To survive this, we store a copy
// of the Supabase refresh token in a plain (non-HttpOnly) cookie alongside
// localStorage.  On boot, if `getSession()` comes back empty we use the
// cookie to call `refreshSession()` and silently recover the session.
//
// The refresh token itself has a long TTL (Supabase default: 60 days) and is
// single-use — Supabase rotates it on every refresh, so we always keep the
// backup current.
// ---------------------------------------------------------------------------

const RT_COOKIE = "tb-rt"; // "TourBook refresh token"
const RT_COOKIE_MAX_AGE_S = 60 * 24 * 60 * 60; // 60 days

/** Persist a copy of the refresh token in a SameSite=Lax cookie. */
export function backupRefreshToken(refreshToken: string): void {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + RT_COOKIE_MAX_AGE_S * 1000).toUTCString();
  document.cookie = `${RT_COOKIE}=${encodeURIComponent(refreshToken)}; expires=${expires}; path=/; SameSite=Lax`;
}

/** Read the backed-up refresh token from the cookie, or null if absent. */
export function getBackupRefreshToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^|;\s*)tb-rt=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : null;
}

/** Remove the backed-up refresh token cookie (called on sign-out). */
export function clearBackupRefreshToken(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${RT_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

// ---------------------------------------------------------------------------

/**
 * Returns a singleton Supabase browser client that stores auth tokens in
 * localStorage rather than cookies. This ensures tokens survive PWA
 * open/close cycles on iOS and Android home-screen installs.
 *
 * Supabase JS v2 uses localStorage by default, so we just need to make sure
 * we're using createClient (not @supabase/ssr's createBrowserClient which
 * uses cookies).
 */
export function getBrowserSupabaseClient() {
  if (browserClient) {
    return browserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for browser auth.");
  }

  browserClient = createClient(url, anonKey, {
    auth: {
      // Store session in localStorage so it survives PWA close/reopen.
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      // Detect session in URL (for email magic links / OAuth redirects).
      detectSessionInUrl: true,
    },
  });

  return browserClient;
}

/**
 * Syncs the current browser session to server-side cookies so that
 * Next.js API routes (which use @supabase/ssr cookie-based auth) can
 * authenticate the user.  Should be called:
 *  - Once on app boot after restoring the session from localStorage
 *  - Whenever the auth token is refreshed (via onAuthStateChange)
 */
export async function syncSessionToServer(accessToken: string, refreshToken: string): Promise<void> {
  try {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ accessToken, refreshToken }),
    });

    if (!response.ok) {
      console.warn("[auth] Failed to sync session to server:", response.status);
    }
  } catch (err) {
    console.warn("[auth] syncSessionToServer error:", err);
  }
}

/**
 * Clears the server-side session cookie by calling the session endpoint
 * with empty/invalid tokens — or simply by clearing the sb- cookies via
 * a dedicated endpoint.  For logout, signOut() on the supabase client
 * removes localStorage tokens; this helper ensures server cookies are
 * also invalidated.
 */
export async function clearServerSession(): Promise<void> {
  try {
    await fetch("/api/auth/session", {
      method: "DELETE",
      credentials: "same-origin",
    });
  } catch {
    // Best-effort — ignore errors on logout.
  }
}
