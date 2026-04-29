"use client";

import { FormEvent, useMemo, useState } from "react";
import { getBrowserSupabaseClient, backupRefreshToken, authLog, backupRememberedEmail, getBackupRememberedEmail, clearBackupRememberedEmail } from "@/lib/supabase/client";

interface LoginPageClientProps {
  initialEmail?: string | null;
  inviteToken?: string;
}

type AuthMode = "signin" | "signup" | "forgot";

function mapAuthError(message?: string, options?: { mode?: AuthMode; fallback?: string }) {
  const raw = (message || "").trim();
  const text = raw.toLowerCase();
  const mode = options?.mode ?? "signin";
  const fallback =
    options?.fallback
    ?? (mode === "signup"
      ? "Unable to create your account right now. Please try again."
      : mode === "forgot"
        ? "Unable to send the reset email right now. Please try again."
        : "Unable to sign in right now. Please try again.");

  if (!text || text === '{}' || text === '[object object]') {
    return fallback;
  }

  if (
    text.includes('invalid login credentials')
    || text.includes('email not confirmed')
    || text.includes('invalid email or password')
    || text.includes('incorrect password')
  ) {
    return 'Invalid email or password.';
  }

  if (text.includes('already registered') || text.includes('user already registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }

  if (text.includes('password') && text.includes('weak')) {
    return 'Password is too weak. Use at least 8 characters with a stronger mix.';
  }

  if (
    text.includes('load failed')
    || text.includes('failed to fetch')
    || text.includes('fetch failed')
    || text.includes('networkerror')
    || text.includes('network request failed')
  ) {
    return 'Network error. Check your connection and try again.';
  }

  if (
    text.includes('500')
    || text.includes('502')
    || text.includes('503')
    || text.includes('504')
    || text.includes('internal server error')
    || text.includes('service unavailable')
  ) {
    return 'Server error. Please try again in a moment.';
  }

  return raw || fallback;
}

export function LoginPageClient({ initialEmail, inviteToken = "" }: LoginPageClientProps) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState(initialEmail || "");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(!!initialEmail);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const submitLabel = useMemo(() => {
    if (loading && mode === "signin") return "Signing in…";
    if (loading && mode === "signup") return "Creating account…";
    if (loading && mode === "forgot") return "Sending reset link…";
    if (mode === "signup") return "Create account";
    if (mode === "forgot") return "Send reset email";
    return "Sign in";
  }, [loading, mode]);

  async function syncSession(accessToken: string, refreshToken: string, emailToRemember?: string) {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        accessToken,
        refreshToken,
        email: emailToRemember,
      }),
    });

    if (!response.ok) {
      throw new Error(response.status >= 500 ? "Server error" : "Unable to sync session.");
    }
  }

  function routeToApp() {
    window.location.assign(inviteToken ? `/?inviteToken=${encodeURIComponent(inviteToken)}` : "/");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = getBrowserSupabaseClient();
      const normalizedEmail = email.trim().toLowerCase();

      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error || !data.session) {
          setError(mapAuthError(error?.message || "Unable to sign in.", { mode: "signin" }));
          return;
        }

        // Save email to localStorage, sessionStorage, and cookie if "Remember my email" is checked (robust persistence for mobile Safari PWA eviction).
        if (rememberEmail) {
          localStorage.setItem("tourbook_last_email", normalizedEmail);
          sessionStorage.setItem("tourbook_last_email", normalizedEmail);
          backupRememberedEmail(normalizedEmail);
        } else {
          localStorage.removeItem("tourbook_last_email");
          sessionStorage.removeItem("tourbook_last_email");
          clearBackupRememberedEmail();
        }

        // Back up the refresh token to a cookie so we can recover the session
        // if iOS Safari clears localStorage (PWA eviction).
        authLog("login: signInWithPassword succeeded — writing backup cookie");
        backupRefreshToken(data.session.refresh_token);
        authLog("login: syncing session to server…");
        await syncSession(data.session.access_token, data.session.refresh_token, rememberEmail ? normalizedEmail : undefined);
        authLog("login: server sync done — routing to app");
        routeToApp();
        return;
      }

      if (mode === "signup") {
        const emailRedirectTo =
          typeof window !== "undefined"
            ? `${window.location.origin}/login${inviteToken ? `?inviteToken=${encodeURIComponent(inviteToken)}` : ""}`
            : undefined;

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: emailRedirectTo ? { emailRedirectTo } : undefined,
        });

        if (error) {
          setError(mapAuthError(error.message, { mode: "signup" }));
          return;
        }

        if (data.session) {
          authLog("login: signUp succeeded with immediate session — writing backup cookie");
          backupRefreshToken(data.session.refresh_token);
          await syncSession(data.session.access_token, data.session.refresh_token, normalizedEmail);
          routeToApp();
          return;
        }

        // Persist email for prefill on login form, regardless of confirmation status (robust persistence for mobile Safari PWA eviction).
        localStorage.setItem("tourbook_last_email", normalizedEmail);
        sessionStorage.setItem("tourbook_last_email", normalizedEmail);
        backupRememberedEmail(normalizedEmail);

        setSuccess("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
        setPassword("");
        return;
      }

      const resetRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password${inviteToken ? `?inviteToken=${encodeURIComponent(inviteToken)}` : ""}`
          : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: resetRedirectTo,
      });

      if (error) {
        setError(mapAuthError(error.message, { mode: "forgot" }));
        return;
      }

      setSuccess("If this email is registered, a password reset link has been sent.");
    } catch (err) {
      setError(
        err instanceof Error
          ? mapAuthError(err.message, { mode })
          : mode === "signup"
            ? "Unable to create your account right now."
            : mode === "forgot"
              ? "Unable to send the reset email right now."
              : "Unable to sign in right now.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">TourBook</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {mode === "signup" ? "Create account" : mode === "forgot" ? "Reset password" : "Sign in"}
        </h1>
        {inviteToken ? (
          <p className="mt-2 text-xs text-sky-300">Invite token detected. Complete auth and invite acceptance will continue.</p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 rounded-xl border border-white/10 bg-black/20 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError("");
              setSuccess("");
            }}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition ${mode === "signin" ? "bg-white text-black" : "text-zinc-300 hover:bg-white/5"}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError("");
              setSuccess("");
            }}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition ${mode === "signup" ? "bg-white text-black" : "text-zinc-300 hover:bg-white/5"}`}
          >
            Create account
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-zinc-200" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-white/20"
              placeholder="you@example.com"
              required
            />
            {mode === "signin" ? (
              <label className="mt-3 flex items-center text-xs text-zinc-400 transition hover:text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(event) => setRememberEmail(event.target.checked)}
                  className="mr-2 rounded border border-white/10 bg-black/30 text-white transition focus:ring-2 focus:ring-white/20"
                />
                Remember my email
              </label>
            ) : null}
          </div>

          {mode !== "forgot" ? (
            <div>
              <label className="block text-sm font-medium text-zinc-200" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-white/20"
                placeholder="••••••••"
                minLength={8}
                required
              />
              {mode === "signin" ? (
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot");
                    setError("");
                    setSuccess("");
                  }}
                  className="mt-2 text-xs text-zinc-400 transition hover:text-zinc-200"
                >
                  Forgot password?
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError("");
                setSuccess("");
              }}
              className="text-xs text-zinc-400 transition hover:text-zinc-200"
            >
              Back to sign in
            </button>
          )}

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {success ? <p className="text-sm text-sky-300">{success}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </form>
      </div>
    </main>
  );
}
