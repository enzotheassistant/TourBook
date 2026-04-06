'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShowCard } from '@/components/show-card';
import { isPastShow, yearFromDate } from '@/lib/date';
import { listShows } from '@/lib/data-client';
import { Show } from '@/lib/types';

export function DashboardClient() {
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'past' ? 'past' : 'upcoming';

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const nextShows = await listShows();
        if (!active) return;
        setShows(nextShows);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    window.addEventListener('tourbook:shows-updated', load);

    return () => {
      active = false;
      window.removeEventListener('tourbook:shows-updated', load);
    };
  }, []);

  const upcomingShows = useMemo(() => shows.filter((show) => !isPastShow(show.date)), [shows]);
  const pastShows = useMemo(() => shows.filter((show) => isPastShow(show.date)).sort((a, b) => b.date.localeCompare(a.date)), [shows]);
  const pastByYear = useMemo(() => {
    const groups = new Map<number, Show[]>();
    for (const show of pastShows) {
      const year = yearFromDate(show.date);
      groups.set(year, [...(groups.get(year) ?? []), show]);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0] - a[0]);
  }, [pastShows]);

  if (loading) {
    return <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">Loading dates...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">{tab === 'past' ? 'PAST DATES' : 'UPCOMING DATES'}</p>
      </div>

      {tab === 'past' ? (
        pastByYear.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">No past dates yet.</div>
        ) : (
          <div className="space-y-5">
            {pastByYear.map(([year, items]) => (
              <section key={year} className="space-y-3">
                <div className="sticky top-[84px] z-10 border-b border-white/10 bg-zinc-950/95 py-2 text-sm font-medium tracking-wide text-zinc-400 backdrop-blur">
                  {year}
                </div>
                <div className="grid gap-3">
                  {items.map((show) => (
                    <ShowCard key={show.id} show={show} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : upcomingShows.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">No upcoming dates yet.</div>
      ) : (
        <div className="grid gap-3">
          {upcomingShows.map((show) => (
            <ShowCard key={show.id} show={show} />
          ))}
        </div>
      )}
    </div>
  );
}
