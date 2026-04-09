'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { GuestListManager } from '@/components/guest-list-manager';
import { deleteShow, exportGuestListCsv, getShow } from '@/lib/data-client';
import { KeyValueList } from '@/components/key-value-list';
import { SectionCard } from '@/components/section-card';
import { parseStoredDate } from '@/lib/date';
import { Show } from '@/lib/types';

function hasAccommodation(show: Show) {
  return Boolean(show.hotel_name || show.hotel_address || show.hotel_notes || show.hotel_maps_url);
}

function PencilIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12 20H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M16.5 3.5C17.3284 2.67157 18.6716 2.67157 19.5 3.5C20.3284 4.32843 20.3284 5.67157 19.5 6.5L8 18L4 19L5 15L16.5 3.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function viewButtonClassName(active: boolean) {
  return `inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-medium transition ${active ? 'border border-emerald-400/45 bg-emerald-500/12 text-emerald-200' : 'border border-white/10 bg-transparent text-zinc-300 hover:border-white/20 hover:bg-white/[0.05]'}`;
}


function formatHeaderDate(date: string) {
  const parsed = parseStoredDate(date);
  if (!parsed) return 'Date TBD';

  const weekdayMonthDay = new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(parsed);

  return `${weekdayMonthDay} · ${parsed.getFullYear()}`;
}

export function ShowPageClient({ showId, adminMode = false }: { showId: string; adminMode?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get('view') === 'guest-list' ? 'guest-list' : 'day-sheet';
  const returnTab = searchParams.get('tab') === 'past' ? 'past' : 'upcoming';
  const [menuOpen, setMenuOpen] = useState(false);
  const [show, setShow] = useState<Show | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; description: string; confirmLabel?: string; tone?: 'default' | 'danger' }>({ open: false, title: '', description: '' });
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

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

  function requestConfirmation(options: { title: string; description: string; confirmLabel?: string; tone?: 'default' | 'danger' }) {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState({ open: true, ...options });
    });
  }

  function closeConfirmation(result: boolean) {
    confirmResolverRef.current?.(result);
    confirmResolverRef.current = null;
    setConfirmState((current) => ({ ...current, open: false }));
  }

  function setView(nextView: 'day-sheet' | 'guest-list') {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('view', nextView);
    router.replace(`?${nextParams.toString()}`, { scroll: false });
  }

  async function handleDelete() {
    if (!show) return;
    const confirmed = await requestConfirmation({ title: 'Delete date?', description: 'Delete this show and its guest list?', confirmLabel: 'Delete', tone: 'danger' });
    if (!confirmed) return;
    await deleteShow(show.id);
    window.dispatchEvent(new Event('tourbook:shows-updated'));
    window.location.href = '/admin/dates';
  }

  async function handleExport() {
    if (!show) return;
    const csv = await exportGuestListCsv(show.id);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${show.id}-guest-list.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  }

  if (!loaded) return <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">Loading show...</div>;
  if (!show) return <div className="rounded-3xl border border-white/10 bg-white/5 p-4"><h1 className="text-xl font-semibold">Show not found</h1><p className="mt-2 text-sm text-zinc-300">That show does not exist in the current dataset.</p></div>;

  const backHref = adminMode ? `/admin/dates?tab=${returnTab}` : `/?tab=${returnTab}`;
  const editHref = `/admin?edit=${show.id}&returnTo=${encodeURIComponent(backHref)}`;
  const duplicateHref = `/admin?duplicate=${show.id}&returnTo=${encodeURIComponent(backHref)}`;

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-zinc-950 text-zinc-50">
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        tone={confirmState.tone}
        onConfirm={() => closeConfirmation(true)}
        onCancel={() => closeConfirmation(false)}
      />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="grid min-w-0 flex-1 grid-cols-[40px,minmax(0,1fr)] items-start gap-x-3">
            <Link href={backHref} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-lg text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]">←</Link>
            <div className="min-w-0 pt-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{show.city}{show.region ? `, ${show.region}` : ''}</h1>
              <p className="mt-0.5 truncate text-base text-zinc-300">{show.venue_name}</p>
              <p className="mt-3 text-sm text-zinc-400">{formatHeaderDate(show.date)}</p>
            </div>
          </div>

          {adminMode ? (
            <div className="relative flex items-center gap-2">
              <Link href={editHref} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]" aria-label="Edit date">
                <PencilIcon />
              </Link>
              <button type="button" onClick={() => setMenuOpen((current) => !current)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]" aria-label="More actions">…</button>
              {menuOpen ? (
                <div className="absolute right-0 top-full z-20 mt-2 min-w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
                  <Link href={duplicateHref} className="block border-b border-white/5 px-4 py-3 text-sm text-zinc-200">Duplicate date</Link>
                  <button type="button" onClick={handleExport} className="block w-full border-b border-white/5 px-4 py-3 text-left text-sm text-zinc-200">Export guest list</button>
                  <button type="button" onClick={handleDelete} className="block w-full px-4 py-3 text-left text-sm text-red-200">Delete</button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {show.tour_name ? <p className="text-sm text-emerald-300">{show.tour_name}</p> : null}

        <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-2">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setView('day-sheet')} className={viewButtonClassName(requestedView === 'day-sheet')}>Day Sheet</button>
            <button type="button" onClick={() => setView('guest-list')} className={viewButtonClassName(requestedView === 'guest-list')}>Guest List</button>
          </div>
        </div>

        {requestedView === 'day-sheet' ? (
          <>
            {show.visibility.show_venue ? <SectionCard title="Venue"><div className="space-y-3 text-sm text-zinc-200"><p className="font-medium">{show.venue_name}</p>{show.venue_maps_url ? <a href={show.venue_maps_url} target="_blank" rel="noreferrer" className="break-words text-emerald-300 underline underline-offset-4">{show.venue_address}</a> : <p>{show.venue_address}</p>}</div></SectionCard> : null}
            {show.visibility.show_parking_load_info && show.parking_load_info ? <SectionCard title="Load / parking info"><p className="text-sm text-zinc-200">{show.parking_load_info}</p></SectionCard> : null}
            {show.visibility.show_schedule && visibleScheduleItems.length > 0 ? <SectionCard title="Schedule"><KeyValueList items={visibleScheduleItems.map((item) => ({ label: item.label, value: item.time }))} /></SectionCard> : null}
            {show.visibility.show_dos_contact && (show.dos_name || show.dos_phone) ? <SectionCard title="DOS contact"><KeyValueList items={[{ label: 'Name', value: show.dos_name }, { label: 'Phone', value: show.dos_phone }]} /></SectionCard> : null}
            {show.visibility.show_accommodation && hasAccommodation(show) ? <SectionCard title="Accommodation"><div className="space-y-3 text-sm text-zinc-200">{show.hotel_name ? <p className="font-medium">{show.hotel_name}</p> : null}{show.hotel_address ? show.hotel_maps_url ? <a href={show.hotel_maps_url} target="_blank" rel="noreferrer" className="break-words text-emerald-300 underline underline-offset-4">{show.hotel_address}</a> : <p>{show.hotel_address}</p> : null}{show.hotel_notes ? <p>{show.hotel_notes}</p> : null}</div></SectionCard> : null}
            {show.visibility.show_notes && show.notes ? <SectionCard title="Notes"><p className="text-sm text-zinc-200">{show.notes}</p></SectionCard> : null}
          </>
        ) : (
          <SectionCard title="Guest List"><GuestListManager showId={show.id} note={show.guest_list_notes} showNote={show.visibility.show_guest_list_notes} /></SectionCard>
        )}
      </main>
    </div>
  );
}
