import Link from 'next/link';
import { ReactNode } from 'react';
import { LogoutButton } from '@/components/logout-button';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Link href="/" className="text-lg font-semibold tracking-tight">
                TourBook
              </Link>
              <p className="text-xs text-zinc-400">Touring crew dashboard</p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/admin"
                className="rounded-full border border-white/10 px-3 py-2 text-sm text-zinc-200 transition hover:border-white/20 hover:bg-white/5"
              >
                Admin
              </Link>
              <LogoutButton />
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/?tab=upcoming"
              className="rounded-full border border-white/10 px-3 py-2 text-zinc-200 transition hover:border-white/20 hover:bg-white/5"
            >
              Upcoming
            </Link>
            <Link
              href="/?tab=past"
              className="rounded-full border border-white/10 px-3 py-2 text-zinc-200 transition hover:border-white/20 hover:bg-white/5"
            >
              Past
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">{children}</main>
    </div>
  );
}
