'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShowCard } from '@/components/show-card';
import { isPastShow, yearFromDate } from '@/lib/date';
import { listShows } from '@/lib/data-client';
import { Show } from '@/lib/types';

function normalizeTourName(value: string) {
  return value.trim() || 'All';
}

function sortTourNamesForUpcoming(shows: Show[]) {
  const byTour = new Map<string, string>();

  for (const show of shows) {
    const tour = normalizeTourName(show.tour_name);
    const current = byTour.get(tour);
    if (!current || show.date < current) {
      byTour.set(tour, show.date);
    }
  }

  return Array.from(byTour.entries())
    .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
    .map(([tour]) => tour);
}

function sortTourNamesForPast(shows: Show[]) {
  const byTour = new Map<string, string>();

  for (const show of shows) {
    const tour = normalizeTourName(show.tour_name);
    const current = byTour.get(tour);
    if (!current || show.date > current) {
      byTour.set(tour, show.date);
    }
  }

  return Array.from(byTour.entries())
    .sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0]))
    .map(([tour]) => tour);
}

export function DashboardClient() {
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [upcomingTour, setUpcomingTour] = useState('All');
  const [pastTour, setPastTour] = useState('All');
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
  const upcomingTours = useMemo(() => ['All', ...sortTourNamesForUpcoming(upcomingShows).filter((tour) => tour !== 'All')], [upcomingShows]);
  const pastTours = useMemo(() => ['All', ...sortTourNamesForPast(pastShows).filter((tour) => tour !== 'All')], [pastShows]);

  useEffect(() => {
    if (!upcomingTours.includes(upcomingTour)) {
      setUpcomingTour('All');
    }
  }, [upcomingTour, upcomingTours]);

  useEffect(() => {
    if (!pastTours.includes(pastTour)) {
      setPastTour('All');
    }
  }, [pastTour, pastTours]);

  const filteredUpcomingShows = useMemo(
    () => upcomingShows.filter((show) => upcomingTour === 'All' || normalizeTourName(show.tour_name) === upcomingTour),
    [upcomingShows, upcomingTour],
  );

  const filteredPastShows = useMemo(
    () => pastShows.filter((show) => pastTour === 'All' || normalizeTourName(show.tour_name) === pastTour),
    [pastShows, pastTour],
  );

  const pastByYear = useMemo(() => {
    const groups = new Map<number, Show[]>();
    for (const show of filteredPastShows) {
      const year = yearFromDate(show.date);
      groups.set(year, [...(groups.get(year) ?? []), show]);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0] - a[0]);
  }, [filteredPastShows]);

  if (loading) {
    return <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">Loading dates...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        {tab === 'past' ? (
          <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300 sm:flex-row sm:items-center sm:justify-between">
            <span>Past Dates</span>
            <select value={pastTour} onChange={(event) => setPastTour(event.target.value)} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-medium normal-case tracking-normal text-zinc-100 outline-none">
              {pastTours.map((tour) => (
                <option key={tour} value={tour}>{tour === 'All' ? 'All tours' : tour}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300 sm:flex-row sm:items-center sm:justify-between">
            <span>Upcoming Dates</span>
            <select value={upcomingTour} onChange={(event) => setUpcomingTour(event.target.value)} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-medium normal-case tracking-normal text-zinc-100 outline-none">
              {upcomingTours.map((tour) => (
                <option key={tour} value={tour}>{tour === 'All' ? 'All tours' : tour}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {tab === 'past' ? (
        pastByYear.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">No past dates yet.</div>
        ) : (
          <div className="space-y-5">
            {pastByYear.map(([year, items]) => (
              <section key={year} className="space-y-3">
                <div className="sticky top-[100px] z-10 border-b border-white/10 bg-zinc-950/95 py-2 text-sm font-medium tracking-wide text-zinc-400 backdrop-blur">
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
      ) : filteredUpcomingShows.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">No upcoming dates yet.</div>
      ) : (
        <div className="grid gap-3">
          {filteredUpcomingShows.map((show) => (
            <ShowCard key={show.id} show={show} />
          ))}
        </div>
      )}
    </div>
  );
}
