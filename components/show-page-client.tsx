'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GuestListManager } from '@/components/guest-list-manager';
import { KeyValueList } from '@/components/key-value-list';
import { SectionCard } from '@/components/section-card';
import { formatShowDate } from '@/lib/date';
import { listShows } from '@/lib/data-client';
import { Show } from '@/lib/types';

function hasAccommodation(show: Show) {
  return Boolean(show.hotel_name || show.hotel_address || show.hotel_notes || show.hotel_maps_url);
}

export function ShowPageClient({ showId }: { showId: string }) {
  const [show, setShow] = useState<Show | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const shows = await listShows();
      if (!active) return;
      setShow(shows.find((item) => item.id === showId) ?? null);
      setLoaded(true);
    }

    load();
    window.addEventListener('tourbook:shows-updated', load);

    return () => {
      active = false;
      window.removeEventListener('tourbook:shows-updated', load);
    };
  }, [showId]);

  if (!loaded) {
    return <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">Loading show...</div>;
  }

  if (!show) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <h1 className="text-xl font-semibold">Show not found</h1>
        <p className="mt-2 text-sm text-zinc-300">That show does not exist in the current dataset.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-400">{formatShowDate(show.date)}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{show.city}</h1>
          <p className="mt-1 text-zinc-300">{show.venue_name}</p>
        </div>
        <Link href="/" className="rounded-full border border-white/10 px-3 py-2 text-sm text-zinc-200">
          Back
        </Link>
      </div>

      {show.visibility.show_venue ? (
        <SectionCard title="Venue">
          <div className="space-y-3 text-sm text-zinc-200">
            <p className="font-medium">{show.venue_name}</p>
            <a href={show.venue_maps_url} target="_blank" rel="noreferrer" className="text-emerald-300 underline underline-offset-4">
              {show.venue_address}
            </a>
          </div>
        </SectionCard>
      ) : null}

      {show.visibility.show_dos_contact ? (
        <SectionCard title="DOS contact">
          <KeyValueList
            items={[
              { label: 'Name', value: show.dos_name },
              { label: 'Phone', value: show.dos_phone },
            ]}
          />
        </SectionCard>
      ) : null}

      {show.visibility.show_parking_load_info && show.parking_load_info ? (
        <SectionCard title="Load / parking info">
          <p className="text-sm text-zinc-200">{show.parking_load_info}</p>
        </SectionCard>
      ) : null}

      {show.visibility.show_schedule ? (
        <SectionCard title="Schedule">
          <KeyValueList
            items={[
              { label: 'Load-in', value: show.load_in },
              { label: 'Soundcheck', value: show.soundcheck },
              { label: 'Doors', value: show.doors },
              { label: 'Show', value: show.show_time },
              { label: 'Curfew', value: show.curfew },
            ]}
          />
        </SectionCard>
      ) : null}

      {show.visibility.show_accommodation && hasAccommodation(show) ? (
        <SectionCard title="Accommodation">
          <div className="space-y-3 text-sm text-zinc-200">
            {show.hotel_name ? <p className="font-medium">{show.hotel_name}</p> : null}
            {show.hotel_address && show.hotel_maps_url ? (
              <a href={show.hotel_maps_url} target="_blank" rel="noreferrer" className="text-emerald-300 underline underline-offset-4">
                {show.hotel_address}
              </a>
            ) : null}
            {show.hotel_notes ? <p>{show.hotel_notes}</p> : null}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Guest list">
        <GuestListManager showId={show.id} />
      </SectionCard>
    </>
  );
}
