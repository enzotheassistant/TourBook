'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { GuestListManager } from '@/components/guest-list-manager';
import { OfflineStatus } from '@/components/offline-status';
import { deleteShow, exportGuestListCsv, getShow, peekCachedShow } from '@/lib/data-client';
import { useAppContext } from '@/hooks/use-app-context';
import { KeyValueList } from '@/components/key-value-list';
import { SectionCard } from '@/components/section-card';
import { parseStoredDate } from '@/lib/date';
import { ScheduleItem, Show } from '@/lib/types';

function hasAccommodation(show: Show) {
  return Boolean(show.hotel_name || show.hotel_address || show.hotel_notes || show.hotel_maps_url);
}

function hasLocation(show: Show) {
  return Boolean(show.venue_name || show.venue_address || show.venue_maps_url || show.city || show.region || show.country);
}

function joinNonEmpty(parts: Array<string | null | undefined>, separator = ' • ') {
  return parts.map((part) => part?.trim()).filter(Boolean).join(separator);
}

function getCityRegionCountry(show: Show) {
  return joinNonEmpty([show.city, show.region, show.country], ', ');
}

function matchesScheduleLabel(label: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(label));
}

const departurePatterns = [/\bdepart\b/i, /\bdeparture\b/i, /\bleave\b/i, /\broll\b/i, /\bwheels\s?up\b/i, /\bout\b/i];
const arrivalPatterns = [/\barrive\b/i, /\barrival\b/i, /\beta\b/i, /\bcheck-?in\b/i, /\bhotel\b/i];
const transportPatterns = [/\bflight\b/i, /\btrain\b/i, /\bvan\b/i, /\bbus\b/i, /\bdrive\b/i, /\bferry\b/i, /\bshuttle\b/i, /\btransport\b/i, /\buber\b/i, /\blyft\b/i];

function splitTravelSchedule(items: ScheduleItem[]) {
  const departureItems = items.filter((item) => matchesScheduleLabel(item.label, departurePatterns));
  const arrivalItems = items.filter((item) => matchesScheduleLabel(item.label, arrivalPatterns) && !departureItems.includes(item));
  const transportItems = items.filter(
    (item) => matchesScheduleLabel(item.label, transportPatterns) && !departureItems.includes(item) && !arrivalItems.includes(item),
  );
  const usedItems = new Set([...departureItems, ...arrivalItems, ...transportItems]);
  const timelineItems = items.filter((item) => !usedItems.has(item));

  return { departureItems, arrivalItems, transportItems, timelineItems };
}

function getDayLocationLabel(show: Show) {
  if (show.day_type === 'travel') return 'Route';
  if (show.day_type === 'off') return 'Location';
  return 'Venue';
}

function getLocationTitle(show: Show) {
  if (show.day_type === 'travel') {
    return show.venue_name || show.label || getCityRegionCountry(show) || 'Routing details';
  }

  if (show.day_type === 'off') {
    return show.label || show.venue_name || getCityRegionCountry(show) || 'Location TBA';
  }

  return show.venue_name || 'Venue TBA';
}

function countVisibleScheduleItems(show: Show) {
  return show.schedule_items.filter((item) => item.label.trim() && item.time.trim()).length;
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
  return `inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-medium transition ${active ? 'border border-sky-400/45 bg-sky-500/12 text-sky-200' : 'border border-white/10 bg-transparent text-zinc-300 hover:border-white/20 hover:bg-white/[0.05]'}`;
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

function getHeaderMetaLine(show: Show) {
  if (show.day_type === 'travel') {
    return joinNonEmpty([
      getCityRegionCountry(show) || null,
      show.venue_name || show.label || null,
    ]);
  }

  if (show.day_type === 'off') {
    return joinNonEmpty([
      getCityRegionCountry(show) || null,
      show.venue_name || show.hotel_name || show.label || 'Off day',
    ]);
  }

  return joinNonEmpty([
    getCityRegionCountry(show) || null,
    show.venue_name || show.label || 'Venue TBA',
  ]);
}

function getHeaderSupportMeta(show: Show) {
  const scheduleCount = countVisibleScheduleItems(show);
  return joinNonEmpty([
    show.day_type === 'travel' ? 'Travel Day' : show.day_type === 'off' ? 'Off Day' : 'Show Day',
    show.tour_name || null,
    show.hotel_name ? `Stay: ${show.hotel_name}` : null,
    scheduleCount > 0 ? `${scheduleCount} timeline item${scheduleCount === 1 ? '' : 's'}` : null,
  ]);
}


export function ShowPageClient({ showId, adminMode = false }: { showId: string; adminMode?: boolean }) {
  const { activeWorkspaceId, isLoading: contextLoading } = useAppContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get('view') === 'guest-list' ? 'guest-list' : 'day-sheet';
  const returnTab = searchParams.get('tab') === 'past' ? 'past' : 'upcoming';
  const [menuOpen, setMenuOpen] = useState(false);
  const [show, setShow] = useState<Show | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [statusSource, setStatusSource] = useState<'live' | 'cache'>('live');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showLoadingUI, setShowLoadingUI] = useState(false);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; description: string; confirmLabel?: string; tone?: 'default' | 'danger' }>({ open: false, title: '', description: '' });
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  // Only show the loading card after 200ms — prevents a brief flash for fast/cached loads.
  useEffect(() => {
    if (loaded) return;
    const timer = setTimeout(() => setShowLoadingUI(true), 200);
    return () => clearTimeout(timer);
  }, [loaded]);

  // Reset scroll to top when navigating to a detail page (fixes mobile Safari part-scrolled issue).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [showId]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (contextLoading || !activeWorkspaceId) return;
      const cached = peekCachedShow(showId, { workspaceId: activeWorkspaceId });
      if (cached && active) {
        setShow(cached.data);
        setLastSavedAt(cached.savedAt);
        setHasLoadedOnce(true);
        setLoaded(true);
      }
      // No else branch: `loaded` starts false already; only the cache hit or
      // the finally block below should flip it to true.

      try {
        const result = await getShow(showId, { workspaceId: activeWorkspaceId });
        if (!active) return;
        setShow(result.show);
        setStatusSource(result.source);
        setLastSavedAt(result.savedAt);
        setHasLoadedOnce(true);
      } catch {
        if (!active) return;
        if (cached) {
          setStatusSource('cache');
          return;
        }
        setShow(null);
        setStatusSource('live');
        setLastSavedAt(null);
      } finally {
        if (active) setLoaded(true);
      }
    }
    void load();
    window.addEventListener('tourbook:shows-updated', load);
    return () => {
      active = false;
      window.removeEventListener('tourbook:shows-updated', load);
    };
  // NOTE: hasLoadedOnce intentionally excluded from deps — including it caused the
  // effect to re-run after the first successful fetch, triggering a second getShow()
  // call and an extra render cycle that produced the first-load strobe/blip.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, contextLoading, showId]);

  const visibleScheduleItems = useMemo(() => show?.schedule_items.filter((item) => item.label.trim() && item.time.trim()) ?? [], [show]);
  const travelSchedule = useMemo(() => splitTravelSchedule(visibleScheduleItems), [visibleScheduleItems]);

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
    if (!activeWorkspaceId) return;
    await deleteShow(show.id, { workspaceId: activeWorkspaceId });
    window.dispatchEvent(new Event('tourbook:shows-updated'));
    router.push('/admin/dates');
  }

  async function handleExport() {
    if (!show) return;
    if (!activeWorkspaceId) return;
    const csv = await exportGuestListCsv(show.id, { workspaceId: activeWorkspaceId });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${show.id}-guest-list.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  }

  const backHref = adminMode ? `/admin/dates?tab=${returnTab}` : `/?tab=${returnTab}`;
  const editHref = `/admin?edit=${showId}&returnTo=${encodeURIComponent(backHref)}`;
  const duplicateHref = `/admin?duplicate=${showId}&returnTo=${encodeURIComponent(backHref)}`;
  const isSoftRefreshing = loaded && hasLoadedOnce && show?.id !== showId;

  useEffect(() => {
    router.prefetch(backHref);
    if (adminMode) {
      router.prefetch(editHref);
      router.prefetch(duplicateHref);
    }
  }, [adminMode, backHref, duplicateHref, editHref, router]);

  if (contextLoading || !loaded) {
    // Return null until the deferred timer fires (200ms), so fast/cached loads never
    // flash a loading card. Slow first-loads will show the card after the delay.
    if (!showLoadingUI) return null;
    return <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">Loading show...</div>;
  }
  if (!show) return <div className="rounded-3xl border border-white/10 bg-white/5 p-4"><h1 className="text-xl font-semibold">Show not found</h1><p className="mt-2 text-sm text-zinc-300">That show does not exist in the current dataset.</p></div>;

  const headerMetaLine = getHeaderMetaLine(show);
  const headerSupportMeta = getHeaderSupportMeta(show);
  const daySheetTitle = show.day_type === 'show' ? 'Day Sheet' : 'Day Details';
  const canShowGuestList = show.day_type === 'show';
  const hasAnyDayDetails = hasLocation(show) || Boolean(show.parking_load_info) || visibleScheduleItems.length > 0 || Boolean(show.dos_name || show.dos_phone) || hasAccommodation(show) || Boolean(show.notes);

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
        <div className="grid min-w-0 grid-cols-[40px,minmax(0,1fr)] items-start gap-x-3 gap-y-3">
          <Link href={backHref} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-lg text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]">←</Link>
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">{formatHeaderDate(show.date)}</h1>
                {headerMetaLine ? <p className="mt-1 truncate text-sm text-zinc-200 sm:text-[15px]">{headerMetaLine}</p> : null}
                {headerSupportMeta ? <p className="mt-1 truncate text-[11px] uppercase tracking-[0.16em] text-zinc-500">{headerSupportMeta}</p> : null}
              </div>
              {adminMode ? (
                <div className="relative flex shrink-0 items-center gap-2">
                  <Link href={editHref} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]" aria-label="Edit date">
                    <PencilIcon />
                  </Link>
                  <button type="button" onClick={() => setMenuOpen((current) => !current)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]" aria-label="More actions">…</button>
                  {menuOpen ? (
                    <div className="absolute right-0 top-full z-20 mt-2 min-w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/60 backdrop-blur-none">
                      <Link href={duplicateHref} className="block border-b border-white/5 px-4 py-3 text-sm text-zinc-200">Duplicate date</Link>
                      <button type="button" onClick={handleExport} className="block w-full border-b border-white/5 px-4 py-3 text-left text-sm text-zinc-200">Export guest list</button>
                      <button type="button" onClick={handleDelete} className="block w-full px-4 py-3 text-left text-sm text-red-200">Delete</button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {isSoftRefreshing ? (
          <div className="flex items-center gap-2 px-1 text-xs text-zinc-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-400/70" aria-hidden="true" />
            Loading latest details…
          </div>
        ) : null}

        {statusSource === 'live' ? null : <OfflineStatus savedAt={lastSavedAt ?? show.updated_at} source={statusSource} emptyOfflineMessage={null} />}

        <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-2">
          <div className={`grid gap-2 ${canShowGuestList ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button type="button" onClick={() => setView('day-sheet')} className={viewButtonClassName(requestedView === 'day-sheet')}>{daySheetTitle}</button>
            {canShowGuestList ? <button type="button" onClick={() => setView('guest-list')} className={viewButtonClassName(requestedView === 'guest-list')}>Guest List</button> : null}
          </div>
        </div>

        {requestedView === 'day-sheet' || !canShowGuestList ? (
          show.day_type === 'show' ? (
            <>
              {show.visibility.show_venue && (show.venue_name || show.venue_address || show.day_type === 'show') ? <SectionCard title="Venue"><div className="space-y-3 text-sm text-zinc-200"><p className="font-medium">{show.venue_name || 'Venue TBA'}</p>{show.venue_address ? show.venue_maps_url ? <a href={show.venue_maps_url} target="_blank" rel="noreferrer" className="break-words text-sky-300 underline underline-offset-4">{show.venue_address}</a> : <p>{show.venue_address}</p> : null}</div></SectionCard> : null}
              {show.visibility.show_parking_load_info && show.parking_load_info ? <SectionCard title="Load / parking info"><p className="text-sm text-zinc-200">{show.parking_load_info}</p></SectionCard> : null}
              {show.visibility.show_schedule && visibleScheduleItems.length > 0 ? <SectionCard title="Schedule"><KeyValueList items={visibleScheduleItems.map((item) => ({ label: item.label, value: item.time }))} /></SectionCard> : null}
              {show.visibility.show_dos_contact && (show.dos_name || show.dos_phone) ? <SectionCard title="DOS contact"><KeyValueList items={[{ label: 'Name', value: show.dos_name }, { label: 'Phone', value: show.dos_phone }]} /></SectionCard> : null}
              {show.visibility.show_accommodation && hasAccommodation(show) ? <SectionCard title="Accommodation"><div className="space-y-3 text-sm text-zinc-200">{show.hotel_name ? <p className="font-medium">{show.hotel_name}</p> : null}{show.hotel_address ? show.hotel_maps_url ? <a href={show.hotel_maps_url} target="_blank" rel="noreferrer" className="break-words text-sky-300 underline underline-offset-4">{show.hotel_address}</a> : <p>{show.hotel_address}</p> : null}{show.hotel_notes ? <p>{show.hotel_notes}</p> : null}</div></SectionCard> : null}
              {show.visibility.show_notes && show.notes ? <SectionCard title="Notes"><p className="text-sm text-zinc-200">{show.notes}</p></SectionCard> : null}
            </>
          ) : (
            <>
              {show.visibility.show_venue && hasLocation(show) ? (
                <SectionCard title={getDayLocationLabel(show)}>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <p className="font-medium">{getLocationTitle(show)}</p>
                    {getCityRegionCountry(show) ? <p className="text-zinc-300">{getCityRegionCountry(show)}</p> : null}
                    {show.venue_address ? show.venue_maps_url ? <a href={show.venue_maps_url} target="_blank" rel="noreferrer" className="break-words text-sky-300 underline underline-offset-4">{show.venue_address}</a> : <p>{show.venue_address}</p> : null}
                  </div>
                </SectionCard>
              ) : null}

              {show.day_type === 'travel' && show.visibility.show_schedule && (travelSchedule.departureItems.length > 0 || travelSchedule.arrivalItems.length > 0) ? (
                <SectionCard title="Departure & arrival">
                  <KeyValueList
                    items={[
                      ...travelSchedule.departureItems.map((item) => ({ label: item.label, value: item.time })),
                      ...travelSchedule.arrivalItems.map((item) => ({ label: item.label, value: item.time })),
                    ]}
                  />
                </SectionCard>
              ) : null}

              {show.day_type === 'travel' && ((show.visibility.show_parking_load_info && show.parking_load_info) || (show.visibility.show_schedule && travelSchedule.transportItems.length > 0)) ? (
                <SectionCard title="Transport">
                  <div className="space-y-4">
                    {show.visibility.show_schedule && travelSchedule.transportItems.length > 0 ? <KeyValueList items={travelSchedule.transportItems.map((item) => ({ label: item.label, value: item.time }))} /> : null}
                    {show.visibility.show_parking_load_info && show.parking_load_info ? <p className="text-sm text-zinc-200">{show.parking_load_info}</p> : null}
                  </div>
                </SectionCard>
              ) : null}

              {show.day_type === 'travel' && show.visibility.show_schedule && travelSchedule.timelineItems.length > 0 ? (
                <SectionCard title="Travel timeline">
                  <KeyValueList items={travelSchedule.timelineItems.map((item) => ({ label: item.label, value: item.time }))} />
                </SectionCard>
              ) : null}

              {show.day_type === 'off' && show.visibility.show_schedule && visibleScheduleItems.length > 0 ? (
                <SectionCard title="Reminders & appointments">
                  <KeyValueList items={visibleScheduleItems.map((item) => ({ label: item.label, value: item.time }))} />
                </SectionCard>
              ) : null}

              {show.visibility.show_dos_contact && (show.dos_name || show.dos_phone) ? (
                <SectionCard title={show.day_type === 'travel' ? 'Travel contact' : 'Contact'}>
                  <KeyValueList items={[{ label: 'Name', value: show.dos_name }, { label: 'Phone', value: show.dos_phone }]} />
                </SectionCard>
              ) : null}

              {show.visibility.show_accommodation && hasAccommodation(show) ? (
                <SectionCard title="Accommodation">
                  <div className="space-y-3 text-sm text-zinc-200">
                    {show.hotel_name ? <p className="font-medium">{show.hotel_name}</p> : null}
                    {show.hotel_address ? show.hotel_maps_url ? <a href={show.hotel_maps_url} target="_blank" rel="noreferrer" className="break-words text-sky-300 underline underline-offset-4">{show.hotel_address}</a> : <p>{show.hotel_address}</p> : null}
                    {show.hotel_notes ? <p>{show.hotel_notes}</p> : null}
                  </div>
                </SectionCard>
              ) : null}

              {show.visibility.show_notes && show.notes ? <SectionCard title="Notes"><p className="text-sm text-zinc-200">{show.notes}</p></SectionCard> : null}

              {!hasAnyDayDetails ? (
                <SectionCard title="Day Details">
                  <div className="space-y-2">
                    <p className="text-sm text-zinc-100">This {show.day_type} day is on the itinerary, but the crew-facing details have not been filled in yet.</p>
                    <p className="text-sm leading-6 text-zinc-400">The date is locked in, but routing, lodging, contacts, or notes have not been added for this screen yet.</p>
                  </div>
                </SectionCard>
              ) : null}
            </>
          )
        ) : (
          <SectionCard title="Guest List"><GuestListManager showId={show.id} note={show.guest_list_notes} showNote={show.visibility.show_guest_list_notes} /></SectionCard>
        )}
      </main>
    </div>
  );
}
