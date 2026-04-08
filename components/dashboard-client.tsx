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


function FilterSelect({ value, onChange, options, ariaLabel }: { value: string; onChange: (value: string) => void; options: string[]; ariaLabel: string }) {
  return (
    <div className="relative w-[132px] shrink-0 sm:w-[176px]">
      <select
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-full border border-white/10 bg-black/20 px-4 pr-11 text-sm font-medium text-zinc-100 outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.03]"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option === 'All' ? 'All' : option}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
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
      <div className="rounded-[28px] border border-white/10 bg-white/[0.045] px-5 py-5">
        {tab === 'past' ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold uppercase tracking-[0.24em] text-zinc-300">Past Dates</span>
            <FilterSelect value={pastTour} onChange={setPastTour} options={pastTours} ariaLabel="Past dates tour filter" />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold uppercase tracking-[0.24em] text-zinc-300">Upcoming Dates</span>
            <FilterSelect value={upcomingTour} onChange={setUpcomingTour} options={upcomingTours} ariaLabel="Upcoming dates tour filter" />
          </div>
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
