'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { GuestListManager } from '@/components/guest-list-manager';
import { KeyValueList } from '@/components/key-value-list';
import { SectionCard } from '@/components/section-card';
import { formatShowDate } from '@/lib/date';
import { getShow } from '@/lib/data-client';
import { Show } from '@/lib/types';

function hasAccommodation(show: Show) {
  return Boolean(show.hotel_name || show.hotel_address || show.hotel_notes || show.hotel_maps_url);
}

function viewButtonClassName(active: boolean) {
  return `rounded-2xl border px-4 py-3 text-sm font-medium transition ${active ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-transparent text-zinc-300'}`;
}

export function ShowPageClient({ showId }: { showId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get('view') === 'guest-list' ? 'guest-list' : 'day-sheet';
  const [show, setShow] = useState<Show | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const nextShow = await getShow(showId);
        if (!active) return;
        setShow(nextShow);
      } catch {
        if (!active) return;
        setShow(null);
      } finally {
        if (active) setLoaded(true);
      }
    }

    load();
    window.addEventListener('tourbook:shows-updated', load);

    return () => {
      active = false;
      window.removeEventListener('tourbook:shows-updated', load);
    };
  }, [showId]);

  const visibleScheduleItems = useMemo(() => show?.schedule_items.filter((item) => item.label.trim() && item.time.trim()) ?? [], [show]);

  function setView(nextView: 'day-sheet' | 'guest-list') {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('view', nextView);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }

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
      <div className="flex flex-col items-start gap-3 sm:gap-4">
        <Link href="/" className="inline-flex w-auto items-center rounded-full border border-white/10 px-3 py-2 text-sm text-zinc-200 transition hover:border-white/20 hover:bg-white/5">
          Back
        </Link>
        <div className="min-w-0 text-left">
          <p className="text-sm text-zinc-400">{formatShowDate(show.date)}</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{show.city}</h1>
          <p className="mt-1 break-words text-zinc-300">{show.venue_name}</p>
          {show.tour_name ? <p className="mt-2 text-sm text-emerald-300">{show.tour_name}</p> : null}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-2">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setView('day-sheet')} className={viewButtonClassName(requestedView === 'day-sheet')}>
            Day Sheet
          </button>
          <button type="button" onClick={() => setView('guest-list')} className={viewButtonClassName(requestedView === 'guest-list')}>
            Guest List
          </button>
        </div>
      </div>

      {requestedView === 'day-sheet' ? (
        <>
          {show.visibility.show_venue ? (
            <SectionCard title="Venue">
              <div className="space-y-3 text-sm text-zinc-200">
                <p className="font-medium">{show.venue_name}</p>
                {show.venue_maps_url ? (
                  <a href={show.venue_maps_url} target="_blank" rel="noreferrer" className="break-words text-emerald-300 underline underline-offset-4">
                    {show.venue_address}
                  </a>
                ) : (
                  <p>{show.venue_address}</p>
                )}
              </div>
            </SectionCard>
          ) : null}

          {show.visibility.show_parking_load_info && show.parking_load_info ? (
            <SectionCard title="Load / parking info">
              <p className="text-sm text-zinc-200">{show.parking_load_info}</p>
            </SectionCard>
          ) : null}

          {show.visibility.show_schedule && visibleScheduleItems.length > 0 ? (
            <SectionCard title="Schedule">
              <KeyValueList items={visibleScheduleItems.map((item) => ({ label: item.label, value: item.time }))} />
            </SectionCard>
          ) : null}

          {show.visibility.show_dos_contact && (show.dos_name || show.dos_phone) ? (
            <SectionCard title="DOS contact">
              <KeyValueList items={[{ label: 'Name', value: show.dos_name }, { label: 'Phone', value: show.dos_phone }]} />
            </SectionCard>
          ) : null}

          {show.visibility.show_accommodation && hasAccommodation(show) ? (
            <SectionCard title="Accommodation">
              <div className="space-y-3 text-sm text-zinc-200">
                {show.hotel_name ? <p className="font-medium">{show.hotel_name}</p> : null}
                {show.hotel_address ? (
                  show.hotel_maps_url ? (
                    <a href={show.hotel_maps_url} target="_blank" rel="noreferrer" className="break-words text-emerald-300 underline underline-offset-4">
                      {show.hotel_address}
                    </a>
                  ) : (
                    <p>{show.hotel_address}</p>
                  )
                ) : null}
                {show.hotel_notes ? <p>{show.hotel_notes}</p> : null}
              </div>
            </SectionCard>
          ) : null}

          {show.visibility.show_notes && show.notes ? (
            <SectionCard title="Notes">
              <p className="text-sm text-zinc-200">{show.notes}</p>
            </SectionCard>
          ) : null}
        </>
      ) : (
        <SectionCard title="Guest List">
          <GuestListManager showId={show.id} note={show.guest_list_notes} showNote={show.visibility.show_guest_list_notes} />
        </SectionCard>
      )}
    </>
  );
}
