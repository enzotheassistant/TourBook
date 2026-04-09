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
    if (!current || show.date < current) byTour.set(tour, show.date);
  }
  return Array.from(byTour.entries()).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([tour]) => tour);
}

function sortTourNamesForPast(shows: Show[]) {
  const byTour = new Map<string, string>();
  for (const show of shows) {
    const tour = normalizeTourName(show.tour_name);
    const current = byTour.get(tour);
    if (!current || show.date > current) byTour.set(tour, show.date);
  }
  return Array.from(byTour.entries()).sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0])).map(([tour]) => tour);
}

function FilterSelect({ value, onChange, options, ariaLabel }: { value: string; onChange: (value: string) => void; options: string[]; ariaLabel: string }) {
  return (
    <div className="relative w-[132px] shrink-0 sm:w-[176px]">
      <select value={value} aria-label={ariaLabel} onChange={(event) => onChange(event.target.value)} className="h-11 w-full appearance-none rounded-full border border-white/10 bg-black/20 px-4 pr-11 text-sm font-medium text-zinc-100 outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.03]">
        {options.map((option) => <option key={option} value={option}>{option === 'All' ? 'All' : option}</option>)}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative min-w-0 flex-1">
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search" aria-label="Search dates" className="h-11 w-full rounded-full border border-white/10 bg-black/20 px-4 pr-10 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-400/40" />
      {value ? <button type="button" onClick={() => onChange('')} className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200" aria-label="Clear search">×</button> : null}
    </div>
  );
}

export function DashboardClient() {
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [upcomingTour, setUpcomingTour] = useState('All');
  const [pastTour, setPastTour] = useState('All');
  const [upcomingSearch, setUpcomingSearch] = useState('');
  const [pastSearch, setPastSearch] = useState('');
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

  useEffect(() => { if (!upcomingTours.includes(upcomingTour)) setUpcomingTour('All'); }, [upcomingTour, upcomingTours]);
  useEffect(() => { if (!pastTours.includes(pastTour)) setPastTour('All'); }, [pastTour, pastTours]);

  const filteredUpcomingShows = useMemo(() => upcomingShows.filter((show) => (upcomingTour === 'All' || normalizeTourName(show.tour_name) === upcomingTour) && [show.city, show.region, show.venue_name, show.tour_name, show.date].join(' ').toLowerCase().includes(upcomingSearch.trim().toLowerCase())), [upcomingShows, upcomingTour, upcomingSearch]);
  const filteredPastShows = useMemo(() => pastShows.filter((show) => (pastTour === 'All' || normalizeTourName(show.tour_name) === pastTour) && [show.city, show.region, show.venue_name, show.tour_name, show.date].join(' ').toLowerCase().includes(pastSearch.trim().toLowerCase())), [pastShows, pastTour, pastSearch]);

  const pastByYear = useMemo(() => {
    const groups = new Map<string, Show[]>();
    for (const show of filteredPastShows) {
      const year = String(yearFromDate(show.date) ?? 'Unknown');
      groups.set(year, [...(groups.get(year) ?? []), show]);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === 'Unknown') return 1;
      if (b[0] === 'Unknown') return -1;
      return Number(b[0]) - Number(a[0]);
    });
  }, [filteredPastShows]);

  if (loading) return <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">Loading dates...</div>;

  return (
    <div className="space-y-3">
      <div className="rounded-[28px] border border-white/10 bg-white/[0.045] px-5 py-5">
        <div className="space-y-3">
          <span className="block whitespace-nowrap text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-300 sm:text-sm sm:tracking-[0.24em]">{tab === 'past' ? 'Past Dates' : 'Upcoming Dates'}</span>
          <div className="flex items-center gap-2">
            <SearchInput value={tab === 'past' ? pastSearch : upcomingSearch} onChange={tab === 'past' ? setPastSearch : setUpcomingSearch} />
            <FilterSelect value={tab === 'past' ? pastTour : upcomingTour} onChange={tab === 'past' ? setPastTour : setUpcomingTour} options={tab === 'past' ? pastTours : upcomingTours} ariaLabel={`${tab} dates tour filter`} />
          </div>
        </div>
      </div>

      {tab === 'past' ? (
        pastByYear.length === 0 ? <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">No past dates yet.</div> : (
          <div className="space-y-5">
            {pastByYear.map(([year, items]) => (
              <section key={year} className="space-y-3">
                <div className="sticky top-[100px] z-10 border-b border-white/10 bg-zinc-950/95 py-2 text-sm font-medium tracking-wide text-zinc-400 backdrop-blur">{year}</div>
                <div className="grid gap-3">{items.map((show) => <ShowCard key={show.id} show={show} />)}</div>
              </section>
            ))}
          </div>
        )
      ) : filteredUpcomingShows.length === 0 ? <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">No upcoming dates yet.</div> : <div className="grid gap-3">{filteredUpcomingShows.map((show) => <ShowCard key={show.id} show={show} />)}</div>}
    </div>
  );
}
