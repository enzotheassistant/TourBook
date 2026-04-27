"use client";

import { FormEvent, useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [inviteToken, setInviteToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    async function bootstrapRecovery() {
      try {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        const token = (url.searchParams.get("inviteToken") || "").trim();
        setInviteToken(token);

        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const type = (hash.get("type") || "").trim();
        const accessToken = (hash.get("access_token") || "").trim();
        const refreshToken = (hash.get("refresh_token") || "").trim();

        const supabase = getBrowserSupabaseClient();

        if (type === "recovery" && accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            setError(sessionError.message || "Invalid or expired recovery link.");
            return;
          }

          await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ accessToken, refreshToken }),
          });

          window.history.replaceState(null, "", `${url.pathname}${url.search}`);
          setReady(true);
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setReady(true);
          return;
        }

        setError("Your password reset link is invalid or has expired. Request a new one.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load password reset flow.");
      } finally {
        if (active) setLoading(false);
      }
    }

    bootstrapRecovery();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!ready) {
      setError("Your reset session is not ready. Request a new reset link.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const supabase = getBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message || "Unable to update password.");
        return;
      }

      setSuccess("Password updated successfully. Redirecting to sign in…");
      await supabase.auth.signOut();
      window.setTimeout(() => {
        const params = new URLSearchParams({ reset: "success" });
        if (inviteToken) params.set("inviteToken", inviteToken);
        window.location.assign(`/login?${params.toString()}`);
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">TourBook</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Set a new password</h1>
        <p className="mt-2 text-sm text-zinc-400">Choose a new password for your account.</p>
        {inviteToken ? (
          <p className="mt-2 text-xs text-indigo-300">Invite token detected. You can continue invite acceptance after sign in.</p>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-zinc-200" htmlFor="password">
              New password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-white/20"
              placeholder="••••••••"
              minLength={8}
              required
              disabled={!ready || loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-200" htmlFor="confirmPassword">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-white/20"
              placeholder="••••••••"
              minLength={8}
              required
              disabled={!ready || loading}
            />
          </div>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {success ? <p className="text-sm text-indigo-300">{success}</p> : null}

          <button
            type="submit"
            disabled={!ready || loading}
            className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Updating password…" : "Update password"}
          </button>
        </form>
      </div>
    </main>
  );
}
