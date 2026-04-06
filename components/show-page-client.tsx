'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GuestListManager } from '@/components/guest-list-manager';
import { KeyValueList } from '@/components/key-value-list';
import { SectionCard } from '@/components/section-card';
import { formatShowDate } from '@/lib/date';
import { readShowsFromStorage } from '@/lib/local-storage';
import { Show } from '@/lib/types';

export function ShowPageClient({ showId }: { showId: string }) {
  const [show, setShow] = useState<Show | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const shows = readShowsFromStorage();
    setShow(shows.find((item) => item.id === showId) ?? null);
    setLoaded(true);
  }, [showId]);

  if (!loaded) {
    return <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">Loading show...</div>;
  }

  if (!show) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <h1 className="text-xl font-semibold">Show not found</h1>
        <p className="mt-2 text-sm text-zinc-300">That show does not exist in the current local dataset.</p>
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

      <SectionCard title="Venue">
        <div className="space-y-3 text-sm text-zinc-200">
          <p className="font-medium">{show.venue_name}</p>
          <a href={show.venue_maps_url} target="_blank" rel="noreferrer" className="text-emerald-300 underline underline-offset-4">
            {show.venue_address}
          </a>
        </div>
      </SectionCard>

      <SectionCard title="DOS contact">
        <KeyValueList
          items={[
            { label: 'Name', value: show.dos_name },
            { label: 'Phone', value: show.dos_phone },
          ]}
        />
      </SectionCard>

      <SectionCard title="Load / parking info">
        <p className="text-sm text-zinc-200">{show.parking_load_info}</p>
      </SectionCard>

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

      <SectionCard title="Accommodation">
        <div className="space-y-3 text-sm text-zinc-200">
          <p className="font-medium">{show.hotel_name}</p>
          <a href={show.hotel_maps_url} target="_blank" rel="noreferrer" className="text-emerald-300 underline underline-offset-4">
            {show.hotel_address}
          </a>
          <p>{show.hotel_notes}</p>
        </div>
      </SectionCard>

      <SectionCard title="Guest list">
        <GuestListManager showId={show.id} />
      </SectionCard>
    </>
  );
}
