'use client';

import Link from 'next/link';
import { useAppContext } from '@/hooks/use-app-context';
import { LogoutButton } from '@/components/logout-button';
import { DeleteAccountSection } from '@/components/delete-sections';

export function AccountPageClient() {
  const { user, workspaces } = useAppContext();

  return (
    <div className="space-y-3 pb-10">
      <h2 className="px-1 text-lg font-semibold leading-tight tracking-tight text-zinc-50">Account</h2>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.045] p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-sm text-zinc-500">Signed in as</p>
          <p className="truncate text-base text-zinc-100">{user?.email ?? '—'}</p>
        </div>
        <LogoutButton />
      </section>
      <DeleteAccountSection userId={user?.id} workspaces={workspaces} />
      <div className="px-1 pt-1">
        <Link href="/" className="text-sm text-zinc-400 transition hover:text-zinc-100">Back to day sheets</Link>
      </div>
    </div>
  );
}
