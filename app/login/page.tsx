"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

type AuthMode = "signin" | "signup" | "forgot";

function mapAuthError(message?: string) {
  const text = (message || "").toLowerCase();

  if (!text) return "Something went wrong. Please try again.";
  if (text.includes("invalid login credentials")) return "Invalid email or password.";
  if (text.includes("already registered") || text.includes("user already registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (text.includes("password") && text.includes("weak")) {
    return "Password is too weak. Use at least 8 characters with a stronger mix.";
  }

  return message || "Something went wrong. Please try again.";
}

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [inviteToken, setInviteToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const token = (url.searchParams.get("inviteToken") || url.searchParams.get("token") || "").trim();
    setInviteToken(token);

    if (url.searchParams.get("reset") === "success") {
      setMode("signin");
      setSuccess("Password updated. Sign in with your new password.");
    }
  }, []);

  const submitLabel = useMemo(() => {
    if (loading && mode === "signin") return "Signing in…";
    if (loading && mode === "signup") return "Creating account…";
    if (loading && mode === "forgot") return "Sending reset link…";
    if (mode === "signup") return "Create account";
    if (mode === "forgot") return "Send reset email";
    return "Sign in";
  }, [loading, mode]);

  async function syncSession(accessToken: string, refreshToken: string) {
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        accessToken,
        refreshToken,
      }),
    });
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
          setError(mapAuthError(error?.message || "Unable to sign in."));
          return;
        }

        await syncSession(data.session.access_token, data.session.refresh_token);
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
          setError(mapAuthError(error.message));
          return;
        }

        if (data.session) {
          await syncSession(data.session.access_token, data.session.refresh_token);
          routeToApp();
          return;
        }

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
        setError(mapAuthError(error.message));
        return;
      }

      setSuccess("If this email is registered, a password reset link has been sent.");
    } catch (err) {
      setError(err instanceof Error ? mapAuthError(err.message) : "Unable to continue.");
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
        <p className="mt-2 text-sm text-zinc-400">
          {mode === "signup"
            ? "Use your email and password to create an account."
            : mode === "forgot"
              ? "Enter your email to get a password reset link."
              : "Use your email and password to access your workspace."}
        </p>
        {inviteToken ? (
          <p className="mt-2 text-xs text-emerald-300">Invite token detected. Complete auth and invite acceptance will continue.</p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError("");
              setSuccess("");
            }}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${mode === "signin" ? "border-white/20 bg-white/10 text-white" : "border-white/10 text-zinc-300 hover:border-white/20"}`}
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
            className={`rounded-full border px-3 py-1.5 text-xs transition ${mode === "signup" ? "border-white/20 bg-white/10 text-white" : "border-white/10 text-zinc-300 hover:border-white/20"}`}
          >
            Create account
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("forgot");
              setError("");
              setSuccess("");
            }}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${mode === "forgot" ? "border-white/20 bg-white/10 text-white" : "border-white/10 text-zinc-300 hover:border-white/20"}`}
          >
            Forgot password
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
            </div>
          ) : null}

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-300">{success}</p> : null}

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
