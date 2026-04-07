'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminUnlockPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const response = await fetch('/api/auth/admin-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });

    setLoading(false);

    if (!response.ok) {
      setError('Incorrect admin password.');
      return;
    }

    router.push('/admin');
    router.refresh();
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
