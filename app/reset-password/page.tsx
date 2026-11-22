"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { RECOVERY_HASH_STORAGE_KEY } from "@/lib/auth/link-routing";
import { buildInviteContinuationHref } from "@/lib/invites/login-redirect";

// "Set a new password" — where every password reset email link ends up.
// Works like reputable apps:
//   - the link only lets you set a new password; it never just signs you in
//   - an expired or already-used link explains that and offers a new one
//   - after saving, other devices are signed out and you carry on in the app

type Stage = "checking" | "ready" | "link-problem" | "done";

const INPUT_CLASS =
  "w-full rounded-[10px] border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-white/20";

function readParams(value: string) {
  return new URLSearchParams(value.replace(/^[#?]/, ""));
}

async function syncServerSession(accessToken: string, refreshToken: string) {
  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ accessToken, refreshToken }),
  });
}

export default function ResetPasswordPage() {
  const [inviteToken, setInviteToken] = useState("");
  const [stage, setStage] = useState<Stage>("checking");
  const [problem, setProblem] = useState<"expired" | "missing">("expired");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function openResetLink() {
      const url = new URL(window.location.href);
      setInviteToken((url.searchParams.get("inviteToken") || "").trim());

      // The secret part of the link: from the address, or the copy kept by the
      // before-load script (the sign-in library tidies the address quickly).
      let stored = "";
      try {
        stored = sessionStorage.getItem(RECOVERY_HASH_STORAGE_KEY) || "";
        sessionStorage.removeItem(RECOVERY_HASH_STORAGE_KEY);
      } catch {
        // storage unavailable — fine, use the address
      }
      const hash = readParams(window.location.hash || stored);
      const query = url.searchParams;
      const supabase = getBrowserSupabaseClient();

      const fail = (kind: "expired" | "missing") => {
        if (cancelled) return;
        setProblem(kind);
        setStage("link-problem");
      };

      try {
        // Expired or already used.
        if (hash.get("error") || hash.get("error_code") || query.get("error_code")) {
          fail("expired");
          return;
        }

        let session = null as null | { access_token: string; refresh_token: string };

        // Classic link: tokens after "#".
        if (hash.get("type") === "recovery" && hash.get("access_token") && hash.get("refresh_token")) {
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: hash.get("access_token") as string,
            refresh_token: hash.get("refresh_token") as string,
          });
          if (sessionError || !data.session) {
            fail("expired");
            return;
          }
          session = data.session;
        } else if (query.get("token_hash") && query.get("type") === "recovery") {
          // Newer link style: a one-time code in the address.
          const { data, error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: query.get("token_hash") as string,
            type: "recovery",
          });
          if (verifyError || !data.session) {
            fail("expired");
            return;
          }
          session = data.session;
        } else if (query.get("code")) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(query.get("code") as string);
          if (exchangeError || !data.session) {
            fail("expired");
            return;
          }
          session = data.session;
        } else {
          // No reset link at all (e.g. opened this page directly).
          fail("missing");
          return;
        }

        await syncServerSession(session.access_token, session.refresh_token);
        // Take the secret part out of the address bar.
        const cleanSearch = inviteTokenSearch(url.searchParams.get("inviteToken"));
        window.history.replaceState(null, "", `${url.pathname}${cleanSearch}`);
        if (!cancelled) setStage("ready");
      } catch {
        fail("expired");
      }
    }

    void openResetLink();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The two passwords don't match.");
      return;
    }

    setSaving(true);
    try {
      const supabase = getBrowserSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        const text = (updateError.message || "").toLowerCase();
        if (text.includes("different from the old") || text.includes("same as the old")) {
          setError("Choose a password you haven't used for this account before.");
        } else if (text.includes("weak") || text.includes("characters")) {
          setError("That password is too easy to guess. Try a longer one.");
        } else if (text.includes("session") || text.includes("expired") || text.includes("jwt")) {
          setProblem("expired");
          setStage("link-problem");
        } else {
          setError("Couldn't update your password. Please try again.");
        }
        return;
      }

      // Like reputable apps: sign out every other device, stay signed in here.
      await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);
      setPassword("");
      setConfirmPassword("");
      setStage("done");
    } catch {
      setError("Couldn't update your password. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const continueHref = inviteToken ? buildInviteContinuationHref(inviteToken) : "/";
  const newLinkHref = `/login?mode=forgot${inviteToken ? `&inviteToken=${encodeURIComponent(inviteToken)}` : ""}`;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white/5 p-5 shadow-2xl">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">TourBook</p>

        {stage === "checking" ? (
          <>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Set a new password</h1>
            <p className="mt-4 text-sm text-zinc-400">Checking your reset link…</p>
          </>
        ) : null}

        {stage === "link-problem" ? (
          <>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {problem === "expired" ? "This link has expired" : "Reset your password"}
            </h1>
            <p className="mt-3 text-sm text-zinc-400">
              {problem === "expired"
                ? "Password reset links work once and only for a short time. Request a new one and use the newest email."
                : "To set a new password, request a reset link and open it from your email."}
            </p>
            <Link
              href={newLinkHref}
              className="mt-6 block w-full rounded-[10px] bg-white px-4 py-3 text-center text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Send me a new link
            </Link>
            <Link href="/login" className="mt-3 block text-center text-sm text-zinc-400 transition hover:text-zinc-100">
              Back to sign in
            </Link>
          </>
        ) : null}

        {stage === "ready" ? (
          <>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Set a new password</h1>
            <p className="mt-2 text-sm text-zinc-400">Choose a new password for your account.</p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-zinc-200" htmlFor="password">
                    New password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="text-xs text-zinc-400 transition hover:text-zinc-100"
                    aria-pressed={showPassword}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`mt-2 ${INPUT_CLASS}`}
                  minLength={8}
                  required
                  disabled={saving}
                  autoFocus
                />
                <p className="mt-1 text-xs text-zinc-500">At least 8 characters.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-200" htmlFor="confirmPassword">
                  Type it again
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className={`mt-2 ${INPUT_CLASS}`}
                  minLength={8}
                  required
                  disabled={saving}
                />
              </div>

              {error ? <p className="text-sm text-red-300">{error}</p> : null}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-[10px] bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save new password"}
              </button>
            </form>
          </>
        ) : null}

        {stage === "done" ? (
          <>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Password updated</h1>
            <p className="mt-3 text-sm text-zinc-400">
              You&apos;re signed in. For your security, any other phones or computers signed in to your account have been signed out.
            </p>
            <a
              href={continueHref}
              className="mt-6 block w-full rounded-[10px] bg-white px-4 py-3 text-center text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Continue to TourBook
            </a>
          </>
        ) : null}
      </div>
    </main>
  );
}

function inviteTokenSearch(inviteToken: string | null) {
  const token = (inviteToken || "").trim();
  return token ? `?inviteToken=${encodeURIComponent(token)}` : "";
}
