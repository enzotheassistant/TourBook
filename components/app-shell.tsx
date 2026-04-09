'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogoutButton } from '@/components/logout-button';

function tabClassName(active = false) {
  return `inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition ${active ? 'border-emerald-400/45 bg-emerald-500/12 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.08)]' : 'border-white/10 bg-white/[0.02] text-zinc-100 hover:border-white/20 hover:bg-white/[0.05]'}`;
}

function ghostButtonClassName() {
  return 'inline-flex h-10 items-center rounded-full border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]';
}

function menuButtonClassName() {
  return 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-transparent text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]';
}

export function AppShell({
  children,
  activeTab = 'upcoming',
  mode = 'crew',
  title = 'TourBook',
  subtitle = 'Touring crew dashboard',
  showSubtitle = true,
  adminSection,
}: {
  children: ReactNode;
  activeTab?: 'upcoming' | 'past';
  mode?: 'crew' | 'admin';
  title?: string;
  subtitle?: string;
  showSubtitle?: boolean;
  adminSection?: 'new' | 'dates';
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-crew-menu-root="true"]')) return;
      setMenuOpen(false);
    }

    function closeMenu() {
      setMenuOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', closeMenu);
    window.addEventListener('resize', closeMenu);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', closeMenu);
      window.removeEventListener('resize', closeMenu);
    };
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-zinc-950 text-zinc-50">
      <header className="sticky top-0 z-20 bg-zinc-950/94 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pt-4 sm:px-6">
          <div className="flex items-start justify-between gap-3 pb-4">
            <div className="min-w-0">
              <Link href={mode === 'admin' ? '/admin' : activeTab === 'past' ? '/?tab=past' : '/'} className="text-2xl font-semibold tracking-tight text-zinc-50">
                {title}
              </Link>
              {showSubtitle ? <p className="mt-1 text-xs text-zinc-500 sm:text-sm">{subtitle}</p> : null}
            </div>

            {mode === 'crew' ? (
              <div data-crew-menu-root="true" className="relative flex shrink-0 items-center">
                <button type="button" onClick={() => setMenuOpen((current) => !current)} className={menuButtonClassName()} aria-label="Open crew menu">
                  …
                </button>
                {menuOpen ? (
                  <div className="absolute right-0 top-full z-30 mt-2 min-w-[180px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
                    <Link href={activeTab === 'past' ? '/' : '/?tab=past'} className="block px-4 py-3 text-sm text-zinc-200">
                      {activeTab === 'past' ? 'Upcoming' : 'Past'}
                    </Link>
                    <div className="border-t border-white/10" />
                    <Link href="/admin" className="block px-4 py-3 text-sm text-zinc-200">
                      Admin
                    </Link>
                    <button type="button" onClick={handleLogout} className="block w-full px-4 py-3 text-left text-sm text-zinc-200">
                      Logout
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center gap-2 self-start">
                <Link href="/" className={ghostButtonClassName()}>
                  Crew View
                </Link>
                <LogoutButton />
              </div>
            )}
          </div>
          {mode === 'admin' ? (
            <>
              <div className="border-t border-white/10" />
              <div className="flex flex-wrap gap-2 py-4">
                <Link href="/admin" className={tabClassName(adminSection === 'new')}>
                  New Date
                </Link>
                <Link href="/admin/dates" className={tabClassName(adminSection === 'dates')}>
                  Existing Dates
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6">{children}</main>
    </div>
  );
}
