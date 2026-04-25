'use client';

import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-50 sm:px-6">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-[32px] border border-white/10 bg-white/[0.05] p-6 shadow-2xl shadow-black/30">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300">Offline</p>
        <h1 className="text-3xl font-semibold tracking-tight">TourBook can still get you through weak signal.</h1>
        <p className="text-sm leading-6 text-zinc-300">
          If this device has opened your itinerary recently, your saved dates and day details should still load.
          Reconnect when you can to refresh the latest changes.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link href="/" className="inline-flex h-11 items-center justify-center rounded-full border border-emerald-400/45 bg-emerald-500/12 px-4 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20">
            Try itinerary again
          </Link>
          <button type="button" onClick={() => window.location.reload()} className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 px-4 text-sm font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]">
            Reload
          </button>
        </div>
      </div>
    </main>
  );
}
