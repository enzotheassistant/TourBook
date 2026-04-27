'use client';

import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-50 sm:px-6">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 rounded-[32px] border border-white/10 bg-linear-to-br from-white/[0.06] via-white/[0.045] to-white/[0.03] p-6 shadow-2xl shadow-black/30">
        <div className="space-y-3">
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100">
            <span className="h-2 w-2 rounded-full bg-amber-300" aria-hidden="true" />
            Offline
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">TourBook can still carry the day in weak signal.</h1>
          <p className="text-sm leading-6 text-zinc-300">
            If this device opened your itinerary recently, the latest saved dates and day details should still be available.
            When you reconnect, TourBook will refresh quietly with any new changes.
          </p>
        </div>

        <div className="grid gap-3 rounded-[26px] border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">What still works</p>
            <p className="mt-2 text-sm leading-6 text-zinc-200">Saved itinerary lists and recently opened day sheets on this device.</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">When signal returns</p>
            <p className="mt-2 text-sm leading-6 text-zinc-200">Your itinerary refreshes with the latest crew updates the next time TourBook connects.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/" className="inline-flex h-11 items-center justify-center rounded-full border border-sky-400/45 bg-sky-500/12 px-4 text-sm font-medium text-sky-200 transition hover:bg-sky-500/20">
            Open itinerary
          </Link>
          <button type="button" onClick={() => window.location.reload()} className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 px-4 text-sm font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]">
            Reload
          </button>
        </div>
      </div>
    </main>
  );
}
