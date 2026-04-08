'use client';

import Link from 'next/link';
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
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pt-4 sm:px-6">
        <div className="flex items-start justify-between gap-3 pb-4">
          <div>
            <Link href="/" className="text-2xl font-semibold tracking-tight">TourBook</Link>
            <p className="mt-1 text-xs text-zinc-500 sm:text-sm">Admin tools are locked.</p>
          </div>
          <Link href="/" className="inline-flex h-10 items-center rounded-full border border-white/10 px-4 text-sm font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]">
            Back to crew view
          </Link>
        </div>
        <div className="border-t border-white/10" />
      </div>
      <div className="mx-auto flex w-full max-w-md items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full rounded-[28px] border border-white/10 bg-white/[0.045] p-6 shadow-2xl">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Protected area</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Admin unlock</h1>
          <p className="mt-2 text-sm text-zinc-300">Enter the admin password to open editing tools.</p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="grid gap-2">
              <span className="text-sm text-zinc-300">Admin password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 rounded-full border border-white/10 bg-black/20 px-4 text-sm outline-none focus:border-emerald-400/40"
                placeholder="Enter admin password"
              />
            </label>
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <p className="text-xs text-zinc-500">Admin unlock expires automatically after 45 minutes.</p>
            <button type="submit" disabled={loading} className="inline-flex h-11 w-full items-center justify-center rounded-full bg-emerald-500 px-4 text-sm font-medium text-zinc-950 disabled:opacity-60">
              {loading ? 'Unlocking...' : 'Unlock admin'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
