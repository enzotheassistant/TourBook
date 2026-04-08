import Link from 'next/link';
import { formatShowDate, isToday } from '@/lib/date';
import { Show } from '@/lib/types';

export function ShowCard({ show }: { show: Show }) {
  const today = isToday(show.date);

  return (
    <Link
      href={`/shows/${show.id}`}
      className={`block rounded-[28px] border px-5 py-4 shadow-sm transition active:scale-[0.99] ${
        today
          ? 'border-emerald-400/40 bg-emerald-500/[0.12]'
          : 'border-white/10 bg-white/[0.045] hover:border-white/20 hover:bg-white/[0.06]'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-zinc-400">{formatShowDate(show.date)}</p>
          <h2 className="mt-2 text-[2rem] font-semibold leading-none tracking-tight text-zinc-50 sm:text-[2.15rem]">{show.city}</h2>
          <p className="mt-3 text-lg font-medium text-zinc-200">{show.venue_name}</p>
          {show.tour_name ? <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-emerald-300/90">{show.tour_name}</p> : null}
        </div>

        {today ? (
          <span className="inline-flex h-10 items-center rounded-full bg-emerald-400 px-4 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-950">
            Today
          </span>
        ) : null}
      </div>
    </Link>
  );
}
