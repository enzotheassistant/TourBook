'use client';

import { FormEvent, useState } from 'react';

export default function AdminUnlockPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ password }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.message ?? 'Incorrect admin password.');
        setLoading(false);
        return;
      }

      window.location.href = '/admin';
    } catch {
      setError('Unable to unlock admin.');
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">TourBook</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Admin unlock</h1>
        <p className="mt-2 text-sm text-zinc-300">Enter the admin password to open the editing tools.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label className="grid gap-2">
            <span className="text-sm text-zinc-300">Admin password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-white/20"
              placeholder="Enter admin password"
            />
          </label>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          <p className="text-xs text-zinc-500">Admin unlock expires automatically after 45 minutes.</p>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-medium text-zinc-900 disabled:opacity-60"
          >
            {loading ? 'Unlocking...' : 'Unlock admin'}
          </button>
        </form>
      </div>
    </main>
  );
}
