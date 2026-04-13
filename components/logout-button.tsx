'use client';

import { useRouter } from 'next/navigation';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = getBrowserSupabaseClient();
    await supabase.auth.signOut();
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
