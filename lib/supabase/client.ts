"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

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
