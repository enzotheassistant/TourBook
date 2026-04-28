'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/hooks/use-app-context';
import { clearBackupRefreshToken, clearServerSession, getBrowserSupabaseClient } from '@/lib/supabase/client';

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { resetContext } = useAppContext();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');

  async function handleLogout() {
    if (isPending) return;

    setIsPending(true);
    setError('');

    try {
      const supabase = getBrowserSupabaseClient();

      await clearServerSession();

      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw new Error(signOutError.message || 'Unable to sign out.');
      }

      resetContext();
      clearBackupRefreshToken();
      router.replace('/login');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to log out right now.');
      setIsPending(false);
    }
  }

  return (
    <div className={compact ? 'w-full' : 'inline-flex flex-col items-start gap-2'}>
      <button
        type="button"
        onClick={handleLogout}
        disabled={isPending}
        className={compact ? 'inline-flex h-10 w-full items-center justify-center rounded-full border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60' : 'inline-flex h-10 items-center rounded-full border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60'}
      >
        {isPending ? 'Logging out…' : 'Logout'}
      </button>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
