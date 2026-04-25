'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { GuestListManager } from '@/components/guest-list-manager';
import { deleteShow, exportGuestListCsv, getShow } from '@/lib/data-client';
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

function getDayHeroEyebrow(show: Show) {
  if (show.day_type === 'travel') return 'In transit';
  if (show.day_type === 'off') return 'Reset window';
  return 'Show day';
}

function getDayHeroTitle(show: Show) {
  if (show.day_type === 'travel') {
    return show.label || show.venue_name || getCityRegionCountry(show) || 'Travel day';
  }

  if (show.day_type === 'off') {
    return show.label || getCityRegionCountry(show) || show.hotel_name || 'Off day';
  }

  return show.venue_name || `${show.city}${show.region ? `, ${show.region}` : ''}` || 'Show day';
}

function getDayHeroSummary(show: Show) {
  if (show.day_type === 'travel') {
    return joinNonEmpty([
      getCityRegionCountry(show) || null,
      show.hotel_name ? `Stay: ${show.hotel_name}` : null,
      show.venue_address ? 'Address available' : null,
    ]);
  }

  return joinNonEmpty([
    getCityRegionCountry(show) || null,
    show.hotel_name ? `Staying at ${show.hotel_name}` : null,
    show.schedule_items.some((item) => item.label.trim() && item.time.trim()) ? 'Crew reminders on deck' : null,
  ]);
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

function getDayTypeCopy(show: Show) {
  if (show.day_type === 'travel') {
    return {
      badge: 'Travel day',
      title: show.label || show.venue_name || show.city || 'Travel day',
      subtitle: show.city ? `${show.city}${show.region ? `, ${show.region}` : ''}` : 'Routing / transit day',
    };
  }

  if (show.day_type === 'off') {
    return {
      badge: 'Off day',
      title: show.label || show.city || 'Off day',
      subtitle: show.hotel_name || (show.city ? `${show.city}${show.region ? `, ${show.region}` : ''}` : 'Recovery / reset day'),
    };
  }

  return {
    badge: 'Show day',
    title: `${show.city}${show.region ? `, ${show.region}` : ''}` || 'Show day',
    subtitle: show.venue_name || 'Venue TBA',
  };
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-zinc-100">{value}</p>
    </div>
  );
}

function DayOverviewCard({ show }: { show: Show }) {
  const location = getCityRegionCountry(show);
  const summary = getDayHeroSummary(show);

  return (
    <section className="overflow-hidden rounded-[30px] border border-white/10 bg-linear-to-br from-white/[0.08] via-white/[0.05] to-white/[0.03] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300">{getDayHeroEyebrow(show)}</p>
      <h2 className="mt-3 text-[1.45rem] font-semibold tracking-tight text-zinc-50">{getDayHeroTitle(show)}</h2>
      {summary ? <p className="mt-2 text-sm leading-6 text-zinc-300">{summary}</p> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <InfoPill label={show.day_type === 'travel' ? 'Destination' : 'City'} value={location || 'TBA'} />
        <InfoPill label="Date" value={formatHeaderDate(show.date)} />
        <InfoPill label="Stay" value={show.hotel_name || 'Not added yet'} />
      </div>
    </section>
  );
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
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; description: string; confirmLabel?: string; tone?: 'default' | 'danger' }>({ open: false, title: '', description: '' });
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (contextLoading || !activeWorkspaceId) return;
      try {
        const nextShow = await getShow(showId, { workspaceId: activeWorkspaceId });
        if (!active) return;
        setShow(nextShow);
      } catch {
        if (!active) return;
        setShow(null);
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
    window.location.href = '/admin/dates';
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

  if (contextLoading || !loaded) return <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">Loading show...</div>;
  if (!show) return <div className="rounded-3xl border border-white/10 bg-white/5 p-4"><h1 className="text-xl font-semibold">Show not found</h1><p className="mt-2 text-sm text-zinc-300">That show does not exist in the current dataset.</p></div>;

  const copy = getDayTypeCopy(show);
  const backHref = adminMode ? `/admin/dates?tab=${returnTab}` : `/?tab=${returnTab}`;
  const editHref = `/admin?edit=${show.id}&returnTo=${encodeURIComponent(backHref)}`;
  const duplicateHref = `/admin?duplicate=${show.id}&returnTo=${encodeURIComponent(backHref)}`;
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300">{copy.badge}</p>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1>
            <p className="mt-0.5 truncate text-base text-zinc-300">{copy.subtitle}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="min-w-0 text-sm text-zinc-400">{formatHeaderDate(show.date)}</p>
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

        {show.tour_name ? <p className="text-sm text-emerald-300">{show.tour_name}</p> : null}

        <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-2">
          <div className={`grid gap-2 ${canShowGuestList ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button type="button" onClick={() => setView('day-sheet')} className={viewButtonClassName(requestedView === 'day-sheet')}>{daySheetTitle}</button>
            {canShowGuestList ? <button type="button" onClick={() => setView('guest-list')} className={viewButtonClassName(requestedView === 'guest-list')}>Guest List</button> : null}
          </div>
        </div>

        {requestedView === 'day-sheet' || !canShowGuestList ? (
          show.day_type === 'show' ? (
            <>
              {show.visibility.show_venue && (show.venue_name || show.venue_address || show.day_type === 'show') ? <SectionCard title="Venue"><div className="space-y-3 text-sm text-zinc-200"><p className="font-medium">{show.venue_name || 'Venue TBA'}</p>{show.venue_address ? show.venue_maps_url ? <a href={show.venue_maps_url} target="_blank" rel="noreferrer" className="break-words text-emerald-300 underline underline-offset-4">{show.venue_address}</a> : <p>{show.venue_address}</p> : null}</div></SectionCard> : null}
              {show.visibility.show_parking_load_info && show.parking_load_info ? <SectionCard title="Load / parking info"><p className="text-sm text-zinc-200">{show.parking_load_info}</p></SectionCard> : null}
              {show.visibility.show_schedule && visibleScheduleItems.length > 0 ? <SectionCard title="Schedule"><KeyValueList items={visibleScheduleItems.map((item) => ({ label: item.label, value: item.time }))} /></SectionCard> : null}
              {show.visibility.show_dos_contact && (show.dos_name || show.dos_phone) ? <SectionCard title="DOS contact"><KeyValueList items={[{ label: 'Name', value: show.dos_name }, { label: 'Phone', value: show.dos_phone }]} /></SectionCard> : null}
              {show.visibility.show_accommodation && hasAccommodation(show) ? <SectionCard title="Accommodation"><div className="space-y-3 text-sm text-zinc-200">{show.hotel_name ? <p className="font-medium">{show.hotel_name}</p> : null}{show.hotel_address ? show.hotel_maps_url ? <a href={show.hotel_maps_url} target="_blank" rel="noreferrer" className="break-words text-emerald-300 underline underline-offset-4">{show.hotel_address}</a> : <p>{show.hotel_address}</p> : null}{show.hotel_notes ? <p>{show.hotel_notes}</p> : null}</div></SectionCard> : null}
              {show.visibility.show_notes && show.notes ? <SectionCard title="Notes"><p className="text-sm text-zinc-200">{show.notes}</p></SectionCard> : null}
            </>
          ) : (
            <>
              <DayOverviewCard show={show} />

              {show.visibility.show_venue && hasLocation(show) ? (
                <SectionCard title={getDayLocationLabel(show)}>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <p className="font-medium">{getLocationTitle(show)}</p>
                    {getCityRegionCountry(show) ? <p className="text-zinc-300">{getCityRegionCountry(show)}</p> : null}
                    {show.venue_address ? show.venue_maps_url ? <a href={show.venue_maps_url} target="_blank" rel="noreferrer" className="break-words text-emerald-300 underline underline-offset-4">{show.venue_address}</a> : <p>{show.venue_address}</p> : null}
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
                <SectionCard title="Lodging">
                  <div className="space-y-3 text-sm text-zinc-200">
                    {show.hotel_name ? <p className="font-medium">{show.hotel_name}</p> : null}
                    {show.hotel_address ? show.hotel_maps_url ? <a href={show.hotel_maps_url} target="_blank" rel="noreferrer" className="break-words text-emerald-300 underline underline-offset-4">{show.hotel_address}</a> : <p>{show.hotel_address}</p> : null}
                    {show.hotel_notes ? <p>{show.hotel_notes}</p> : null}
                  </div>
                </SectionCard>
              ) : null}

              {show.visibility.show_notes && show.notes ? <SectionCard title="Notes"><p className="text-sm text-zinc-200">{show.notes}</p></SectionCard> : null}

              {!hasAnyDayDetails ? (
                <SectionCard title="Day Details"><p className="text-sm text-zinc-300">This {show.day_type} day is on the itinerary, but detailed routing notes have not been filled in yet.</p></SectionCard>
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
