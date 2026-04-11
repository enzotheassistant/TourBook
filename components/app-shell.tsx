'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { LogoutButton } from '@/components/logout-button';

function tabClassName(active = false) {
  return `inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition ${active ? 'border-emerald-400/45 bg-emerald-500/12 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.08)]' : 'border-white/10 bg-white/[0.02] text-zinc-100 hover:border-white/20 hover:bg-white/[0.05]'}`;
}

function ghostButtonClassName() {
  return 'inline-flex h-10 items-center rounded-full border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]';
}

function iconButtonClassName() {
  return 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-transparent text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]';
}

function CrewMenu({ activeTab }: { activeTab: 'upcoming' | 'past' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handle(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-transparent text-xl text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]" aria-label="Open menu">
        …
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 min-w-[180px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
          <Link href={activeTab === 'upcoming' ? '/?tab=past' : '/?tab=upcoming'} className="block border-b border-white/5 px-4 py-3 text-sm text-zinc-100" onClick={() => setOpen(false)}>
            {activeTab === 'upcoming' ? 'Past' : 'Upcoming'}
          </Link>
          <div className="border-b border-white/10" />
          <Link href="/admin" className="block border-b border-white/5 px-4 py-3 text-sm text-zinc-100" onClick={() => setOpen(false)}>
            Admin
          </Link>
          <div className="px-2 py-2">
            <LogoutButton compact />
          </div>
        </div>
      ) : null}
    </div>
  );
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const actionHref = mode === 'admin' ? '/' : '/admin';
  const actionLabel = mode === 'admin' ? 'Crew View' : 'Admin';
  const isCrewList = mode === 'crew' && pathname === '/';

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-zinc-950 text-zinc-50">
      <header className="sticky top-0 z-20 bg-zinc-950/94 backdrop-blur">
        <div className={`mx-auto flex w-full max-w-5xl flex-col px-4 ${mode === 'admin' ? 'pt-3' : 'pt-4'} sm:px-6`}>
          <div className={`flex items-start justify-between gap-3 ${mode === 'admin' ? 'pb-3' : 'pb-4'}`}>
            <div className="min-w-0">
              <Link href={mode === 'admin' ? '/admin' : '/'} className="text-2xl font-semibold tracking-tight text-zinc-50">
                {title}
              </Link>
              {showSubtitle ? <p className="mt-1 text-xs text-zinc-500 sm:text-sm">{subtitle}</p> : null}
            </div>

            {isCrewList ? (
              <div className="flex items-center gap-2">
                {activeTab === 'past' ? (
                  <Link href="/?tab=upcoming" className={iconButtonClassName()} aria-label="Back to upcoming dates">
                    ←
                  </Link>
                ) : null}
                <CrewMenu activeTab={activeTab} />
              </div>
            ) : (
              <div className="flex items-center gap-2 self-start">
                <Link href={actionHref} className={ghostButtonClassName()}>
                  {actionLabel}
                </Link>
                <LogoutButton />
              </div>
            )}
          </div>
          {mode === 'crew' ? <div className="border-t border-white/10" /> : null}
          {mode === 'admin' ? <div className="py-2" /> : null}
        </div>
      </header>

      <main className={`mx-auto flex w-full max-w-5xl flex-col ${mode === 'admin' ? 'gap-3 py-3' : 'gap-4 py-4'} px-4 sm:px-6`}>{children}</main>
    </div>
  );
}
