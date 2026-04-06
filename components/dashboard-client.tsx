'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShowCard } from '@/components/show-card';
import { isPastShow } from '@/lib/date';
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
      const nextShows = await listShows();
      if (!active) return;
      setShows(nextShows);
      setLoading(false);
    }

    load();
    window.addEventListener('tourbook:shows-updated', load);

    return () => {
      active = false;
      window.removeEventListener('tourbook:shows-updated', load);
    };
  }, []);

  const filteredShows = useMemo(() => {
    return shows.filter((show) => (tab === 'past' ? isPastShow(show.date) : !isPastShow(show.date)));
  }, [shows, tab]);

  if (loading) {
    return <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">Loading shows...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm uppercase tracking-wide text-zinc-400">{tab === 'past' ? 'Past shows' : 'Upcoming shows'}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {tab === 'past' ? 'Past dates' : 'Current and upcoming dates'}
        </h1>
        <p className="mt-2 text-sm text-zinc-300">
          {tab === 'past'
            ? 'Older dates move here automatically after the show date passes.'
            : 'Tap any show to open venue info, schedule, hotel details, and guest list.'}
        </p>
      </div>

      {filteredShows.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
          No {tab} shows yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredShows.map((show) => (
            <ShowCard key={show.id} show={show} />
          ))}
        </div>
      )}
    </div>
  );
}
