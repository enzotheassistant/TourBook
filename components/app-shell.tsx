'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { LogoutButton } from '@/components/logout-button';

function tabClassName(active = false) {
  return `rounded-full border px-3 py-2 text-sm transition ${active ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-white/10 text-zinc-200 hover:border-white/20 hover:bg-white/5'}`;
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
      <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={mode === 'admin' ? '/admin' : '/'} className="text-lg font-semibold tracking-tight">
                {title}
              </Link>
              {showSubtitle ? <p className="text-xs text-zinc-400">{subtitle}</p> : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href={actionHref} className={tabClassName(false)}>
                {actionLabel}
              </Link>
              <LogoutButton />
            </div>
          </div>

          {mode === 'crew' ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link href="/?tab=upcoming" className={tabClassName(activeTab === 'upcoming')}>
                Upcoming
              </Link>
              <Link href="/?tab=past" className={tabClassName(activeTab === 'past')}>
                Past
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4">{children}</main>
    </div>
  );
}
