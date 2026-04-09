'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { LogoutButton } from '@/components/logout-button';

function tabClassName(active = false) {
  return `inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition ${active ? 'border-emerald-400/45 bg-emerald-500/12 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.08)]' : 'border-white/10 bg-white/[0.02] text-zinc-100 hover:border-white/20 hover:bg-white/[0.05]'}`;
}

function ghostButtonClassName() {
  return 'inline-flex h-10 items-center rounded-full border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]';
}

export function AppShell({
  children,
  activeTab = 'upcoming',
  mode = 'crew',
  title = 'TourBook',
  subtitle = 'Touring crew dashboard',
  showSubtitle = true,
}: {
  children: ReactNode;
  activeTab?: 'upcoming' | 'past';
  mode?: 'crew' | 'admin';
  title?: string;
  subtitle?: string;
  showSubtitle?: boolean;
}) {
  const actionHref = mode === 'admin' ? '/' : '/admin';
  const actionLabel = mode === 'admin' ? 'Crew View' : 'Admin';

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-zinc-950 text-zinc-50">
      <header className="sticky top-0 z-20 bg-zinc-950/94 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pt-4 sm:px-6">
          <div className="flex items-start justify-between gap-3 pb-4">
            <div className="min-w-0">
              <Link href={mode === 'admin' ? '/admin' : '/'} className="text-2xl font-semibold tracking-tight text-zinc-50">
                {title}
              </Link>
              {showSubtitle ? <p className="mt-1 text-xs text-zinc-500 sm:text-sm">{subtitle}</p> : null}
            </div>

            <div className="flex items-center gap-2 self-start">
              <Link href={actionHref} className={ghostButtonClassName()}>
                {actionLabel}
              </Link>
              <LogoutButton />
            </div>
          </div>
          <div className="border-t border-white/10" />
          {mode === 'crew' ? (
            <div className="flex items-center gap-2 py-4 text-sm">
              <Link href="/?tab=upcoming" className={tabClassName(activeTab === 'upcoming')}>
                Upcoming
              </Link>
              <Link href="/?tab=past" className={tabClassName(activeTab === 'past')}>
                Past
              </Link>
            </div>
          ) : null}
          {mode === 'admin' ? <div className="py-4" /> : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6">{children}</main>
    </div>
  );
}
