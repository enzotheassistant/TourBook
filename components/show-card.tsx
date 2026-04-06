import Link from 'next/link';
import { formatShowDate, isToday } from '@/lib/date';
import { Show } from '@/lib/types';

export function ShowCard({ show }: { show: Show }) {
  const today = isToday(show.date);

  return (
    <Link
      href={`/shows/${show.id}`}
      className={`block rounded-3xl border p-4 shadow-sm transition active:scale-[0.99] ${
        today
          ? 'border-emerald-400/40 bg-emerald-500/10'
          : 'border-white/10 bg-white/5 hover:border-white/20'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-400">{formatShowDate(show.date)}</p>
          <h2 className="mt-1 text-xl font-semibold">{show.city}</h2>
          <p className="mt-1 text-sm text-zinc-300">{show.venue_name}</p>
        </div>

        {today ? (
          <span className="rounded-full bg-emerald-400 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-900">
            Today
          </span>
        ) : null}
      </div>
    </Link>
  );
}
