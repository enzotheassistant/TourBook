'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={compact ? 'inline-flex h-10 w-full items-center justify-center rounded-full border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]' : 'inline-flex h-10 items-center rounded-full border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]'}
    >
      Logout
    </button>
  );
}
