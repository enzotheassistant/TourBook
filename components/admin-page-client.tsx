'use client';

import Link from 'next/link';
import { FormEvent, ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AddressAutocompleteField } from '@/components/address-autocomplete-field';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { deleteShow, exportGuestListCsv, listShows, upsertShow } from '@/lib/data-client';
import { formatShowDate, isPastShow, isValidStoredDate, yearFromDate } from '@/lib/date';
import { createEmptyScheduleItems, emptyShowForm } from '@/lib/defaults';
import { Show, ShowFormValues } from '@/lib/types';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function bubbleClassName() {
  return 'rounded-[28px] border border-white/10 bg-black/20 p-4';
}

function primaryButtonClassName() {
  return 'inline-flex h-11 items-center justify-center rounded-full bg-emerald-500 px-5 text-sm font-medium text-zinc-950 transition disabled:opacity-60';
}

function secondaryButtonClassName() {
  return 'inline-flex h-10 items-center justify-center rounded-full border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]';
}

function dangerButtonClassName() {
  return 'inline-flex h-10 items-center justify-center rounded-full border border-red-500/30 bg-transparent px-4 text-sm font-medium text-red-200 transition hover:bg-red-500/10';
}

function filterShows(shows: Show[], search: string, selectedTour: string) {
  const normalizedSearch = search.trim().toLowerCase();
  return shows.filter((show) => {
    const normalizedTour = show.tour_name.trim();
    const matchesTour = selectedTour === 'All' || normalizedTour === selectedTour;
    const haystack = [show.city, show.venue_name, formatShowDate(show.date), show.date, show.tour_name].join(' ').toLowerCase();
    const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
    return matchesTour && matchesSearch;
  });
}

function sortTourNamesForUpcoming(shows: Show[]) {
  const map = new Map<string, string>();
  for (const show of shows) {
    const tour = show.tour_name.trim();
    if (!tour) continue;
    const current = map.get(tour);
    if (!current || show.date < current) map.set(tour, show.date);
  }
  return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([tour]) => tour);
}

function sortTourNamesForPast(shows: Show[]) {
  const map = new Map<string, string>();
  for (const show of shows) {
    const tour = show.tour_name.trim();
    if (!tour) continue;
    const current = map.get(tour);
    if (!current || show.date > current) map.set(tour, show.date);
  }
  return Array.from(map.entries()).sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0])).map(([tour]) => tour);
}

function adminTabClassName(active: boolean) {
  return `rounded-full border px-3 py-2 text-sm transition ${active ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-white/10 text-zinc-200 hover:border-white/20 hover:bg-white/5'}`;
}


function fieldClassName() {
  return 'h-12 w-full rounded-full border border-white/10 bg-black/20 px-4 text-sm outline-none placeholder:text-zinc-500 focus:border-emerald-400/40';
}

function filterFieldClassName() {
  return 'h-11 w-full rounded-full border border-white/10 bg-black/20 px-4 pr-10 text-sm outline-none placeholder:text-zinc-500 focus:border-emerald-400/40';
}

type SectionKey = 'basics' | 'venue' | 'parking' | 'schedule' | 'dos' | 'accommodation' | 'notes' | 'guestListNotes';
type VisibilityKey = keyof ShowFormValues['visibility'];
type VisibilityModeMap = Record<VisibilityKey, 'auto' | 'manual'>;
type ExpandedSections = Record<SectionKey, boolean>;

const EXPANDED_SECTIONS_STORAGE_KEY = 'tourbook:new-date-expanded-sections';

const defaultExpandedSections: ExpandedSections = {
  basics: true,
  venue: true,
  parking: false,
  schedule: true,
  dos: false,
  accommodation: false,
  notes: false,
  guestListNotes: false,
};

const visibilityKeyBySection: Partial<Record<SectionKey, VisibilityKey>> = {
  venue: 'show_venue',
  parking: 'show_parking_load_info',
  schedule: 'show_schedule',
  dos: 'show_dos_contact',
  accommodation: 'show_accommodation',
  notes: 'show_notes',
  guestListNotes: 'show_guest_list_notes',
};

function defaultVisibilityModes(mode: 'auto' | 'manual' = 'auto'): VisibilityModeMap {
  return {
    show_venue: mode,
    show_parking_load_info: mode,
    show_schedule: mode,
    show_dos_contact: mode,
    show_accommodation: mode,
    show_notes: mode,
    show_guest_list_notes: mode,
  };
}

function visibilityModesForLoadedForm(form: ShowFormValues): VisibilityModeMap {
  const nextModes = defaultVisibilityModes('manual');

  (Object.entries(visibilityKeyBySection) as Array<[SectionKey, VisibilityKey]>).forEach(([section, key]) => {
    const hasContent = sectionHasContent(section, form);
    if (!form.visibility[key] && !hasContent) {
      nextModes[key] = 'auto';
    }
  });

  return nextModes;
}

function hasScheduleContent(form: ShowFormValues) {
  return form.schedule_items.some((item) => item.label.trim() || item.time.trim());
}

function sectionHasContent(section: SectionKey, form: ShowFormValues) {
  switch (section) {
    case 'basics':
      return Boolean(form.date || form.city || form.tour_name);
    case 'venue':
      return Boolean(form.venue_name || form.venue_address || form.venue_maps_url);
    case 'parking':
      return Boolean(form.parking_load_info.trim());
    case 'schedule':
      return hasScheduleContent(form);
    case 'dos':
      return Boolean(form.dos_name || form.dos_phone);
    case 'accommodation':
      return Boolean(form.hotel_name || form.hotel_address || form.hotel_maps_url || form.hotel_notes);
    case 'notes':
      return Boolean(form.notes.trim());
    case 'guestListNotes':
      return Boolean(form.guest_list_notes.trim());
    default:
      return false;
  }
}

function getExpandedSectionsForPopulatedForm(form: ShowFormValues): ExpandedSections {
  return {
    basics: true,
    venue: sectionHasContent('venue', form),
    parking: sectionHasContent('parking', form),
    schedule: true,
    dos: sectionHasContent('dos', form),
    accommodation: sectionHasContent('accommodation', form),
    notes: sectionHasContent('notes', form),
    guestListNotes: sectionHasContent('guestListNotes', form),
  };
}

function applyAutoVisibility(form: ShowFormValues, visibilityModes: VisibilityModeMap): ShowFormValues {
  const nextVisibility = { ...form.visibility };

  (Object.entries(visibilityKeyBySection) as Array<[SectionKey, VisibilityKey]>).forEach(([section, key]) => {
    if (visibilityModes[key] === 'auto') {
      nextVisibility[key] = sectionHasContent(section, form);
    }
  });

  return {
    ...form,
    visibility: nextVisibility,
  };
}

function readExpandedSectionsPreference() {
  if (typeof window === 'undefined') return defaultExpandedSections;

  try {
    const raw = window.localStorage.getItem(EXPANDED_SECTIONS_STORAGE_KEY);
    if (!raw) return defaultExpandedSections;
    const parsed = JSON.parse(raw) as Partial<ExpandedSections>;
    return { ...defaultExpandedSections, ...parsed };
  } catch {
    return defaultExpandedSections;
  }
}


function formatDateForStorage(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseFlexibleDateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const normalizedNumeric = trimmed.replace(/\//g, '-');
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalizedNumeric)) {
    const [year, month, day] = normalizedNumeric.split('-').map(Number);
    const candidate = new Date(year, month - 1, day);
    if (candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day) {
      return formatDateForStorage(candidate);
    }
  }

  const currentYear = new Date().getFullYear();
  if (/^\d{1,2}-\d{1,2}$/.test(normalizedNumeric)) {
    const [month, day] = normalizedNumeric.split('-').map(Number);
    const candidate = new Date(currentYear, month - 1, day);
    if (candidate.getFullYear() === currentYear && candidate.getMonth() === month - 1 && candidate.getDate() === day) {
      return formatDateForStorage(candidate);
    }
  }

  const hasExplicitYear = /\d{4}/.test(trimmed);
  const parseTarget = hasExplicitYear ? trimmed : `${trimmed} ${currentYear}`;
  const parsed = new Date(parseTarget);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateForStorage(new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  }

  return '';
}

export function AdminPageClient({ mode = 'new' }: { mode?: 'new' | 'dates' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const datesTab = searchParams.get('tab') === 'past' ? 'past' : 'upcoming';
  const statusMessage = searchParams.get('message');
  const [shows, setShows] = useState<Show[]>([]);
  const [expandedSections, setExpandedSections] = useState<ExpandedSections>(defaultExpandedSections);
  const [visibilityModes, setVisibilityModes] = useState<VisibilityModeMap>(() => defaultVisibilityModes());
  const [form, setForm] = useState<ShowFormValues>(() => applyAutoVisibility({ ...emptyShowForm, schedule_items: createEmptyScheduleItems() }, defaultVisibilityModes()));
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [upcomingSearch, setUpcomingSearch] = useState('');
  const [pastSearch, setPastSearch] = useState('');
  const [upcomingTour, setUpcomingTour] = useState('All');
  const [pastTour, setPastTour] = useState('All');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [returnToUrl, setReturnToUrl] = useState('/admin/dates');
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; description: string; confirmLabel?: string; tone?: 'default' | 'danger' }>({ open: false, title: '', description: '' });
  const formRef = useRef<HTMLDivElement | null>(null);
  const handledLoadRef = useRef<string | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    loadShows();
  }, []);

  useEffect(() => {
    if (mode !== 'new') return;
    const stored = readExpandedSectionsPreference();
    setExpandedSections(stored);
    setForm((current) => applyAutoVisibility(current, visibilityModes));
  }, [mode]);

  useEffect(() => {
    if (mode !== 'new' || typeof window === 'undefined') return;
    window.localStorage.setItem(EXPANDED_SECTIONS_STORAGE_KEY, JSON.stringify(expandedSections));
  }, [expandedSections, mode]);

  useEffect(() => {
    function closeMenuOnViewportChange() {
      setOpenMenuId(null);
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-admin-menu-root="true"]')) return;
      setOpenMenuId(null);
    }

    window.addEventListener('scroll', closeMenuOnViewportChange);
    window.addEventListener('resize', closeMenuOnViewportChange);
    document.addEventListener('mousedown', handlePointerDown);

    return () => {
      window.removeEventListener('scroll', closeMenuOnViewportChange);
      window.removeEventListener('resize', closeMenuOnViewportChange);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  const isEditing = useMemo(() => shows.some((show) => show.id === form.id), [form.id, shows]);
  const upcomingShows = useMemo(() => shows.filter((show) => !isPastShow(show.date)), [shows]);
  const pastShows = useMemo(() => shows.filter((show) => isPastShow(show.date)).sort((a, b) => b.date.localeCompare(a.date)), [shows]);
  const upcomingTours = useMemo(() => ['All', ...sortTourNamesForUpcoming(upcomingShows)], [upcomingShows]);
  const pastTours = useMemo(() => ['All', ...sortTourNamesForPast(pastShows)], [pastShows]);
  const filteredUpcomingShows = useMemo(() => filterShows(upcomingShows, upcomingSearch, upcomingTour), [upcomingSearch, upcomingTour, upcomingShows]);
  const filteredPastShows = useMemo(() => filterShows(pastShows, pastSearch, pastTour), [pastSearch, pastTour, pastShows]);
  const availableTours = useMemo(() => Array.from(new Set(shows.map((show) => show.tour_name.trim()).filter(Boolean))).sort(), [shows]);

  const pastShowsByYear = useMemo(() => {
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

  useEffect(() => {
    if (!upcomingTours.includes(upcomingTour)) setUpcomingTour('All');
  }, [upcomingTour, upcomingTours]);

  useEffect(() => {
    if (!pastTours.includes(pastTour)) setPastTour('All');
  }, [pastTour, pastTours]);

  useEffect(() => {
    if (mode !== 'dates' || !statusMessage) return;
    setMessage(statusMessage);
  }, [mode, statusMessage]);

  useEffect(() => {
    if (mode !== 'new' || !shows.length) return;

    const editId = searchParams.get('edit');
    const duplicateId = searchParams.get('duplicate');
    const returnTo = searchParams.get('returnTo');
    const returnTab = searchParams.get('returnTab') === 'past' ? 'past' : 'upcoming';
    const nextAction = duplicateId ? `duplicate:${duplicateId}` : editId ? `edit:${editId}` : null;

    if (returnTo && returnTo !== 'dates' && (editId || duplicateId)) {
      setReturnToUrl(returnTo);
    } else if (returnTo === 'show' && (editId || duplicateId)) {
      const targetId = editId ?? duplicateId;
      setReturnToUrl(`/shows/${encodeURIComponent(targetId ?? '')}?admin=1`);
    } else {
      setReturnToUrl(`/admin/dates?tab=${returnTab}`);
    }

    if (!nextAction || handledLoadRef.current === nextAction) return;

    if (duplicateId) {
      const source = shows.find((show) => show.id === duplicateId);
      if (source) {
        const duplicated = {
          ...source,
          id: '',
          date: '',
          created_at: undefined,
          schedule_items: source.schedule_items.map((item) => ({ ...item, id: crypto.randomUUID() })),
        };
        setVisibilityModes(visibilityModesForLoadedForm(duplicated));
        setForm(duplicated);
        setExpandedSections(getExpandedSectionsForPopulatedForm(duplicated));
        setMessage('Date duplicated into a new draft. Pick the new date and save.');
        setDirty(false);
      }
    } else if (editId) {
      const source = shows.find((show) => show.id === editId);
      if (source) {
        setVisibilityModes(visibilityModesForLoadedForm(source));
        setForm(source);
        setExpandedSections(getExpandedSectionsForPopulatedForm(source));
        setMessage('Loaded date into editor.');
        setDirty(false);
      }
    }

    handledLoadRef.current = nextAction;
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/admin');
    }
  }, [mode, searchParams, shows]);

  async function loadShows() {
    const nextShows = await listShows();
    setShows(nextShows);
  }

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

  function updateForm(mutator: (current: ShowFormValues) => ShowFormValues) {
    setDirty(true);
    setForm((current) => applyAutoVisibility(mutator(current), visibilityModes));
  }

  function updateField<K extends keyof ShowFormValues>(key: K, value: ShowFormValues[K]) {
    updateForm((current) => ({ ...current, [key]: value }));
  }

  function updateVisibility(key: VisibilityKey, value: boolean) {
    setVisibilityModes((current) => ({ ...current, [key]: 'manual' }));
    setForm((current) => ({ ...current, visibility: { ...current.visibility, [key]: value } }));
  }

  function resetForm(nextMessage = 'Ready to create a new date.') {
    const nextModes = defaultVisibilityModes();
    setVisibilityModes(nextModes);
    setExpandedSections(readExpandedSectionsPreference());
    setForm(applyAutoVisibility({ ...emptyShowForm, schedule_items: createEmptyScheduleItems() }, nextModes));
    handledLoadRef.current = null;
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/admin');
    }
    setMessage(nextMessage);
    setDirty(false);
  }

  function updateScheduleItem(id: string, field: 'label' | 'time', value: string) {
    updateForm((current) => ({
      ...current,
      schedule_items: current.schedule_items.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  }

  function addScheduleRow() {
    updateForm((current) => ({
      ...current,
      schedule_items: [...current.schedule_items, { id: crypto.randomUUID(), label: '', time: '' }],
    }));
  }

  function removeScheduleRow(id: string) {
    updateForm((current) => ({
      ...current,
      schedule_items: current.schedule_items.filter((item) => item.id !== id),
    }));
  }

  function setSectionExpanded(section: SectionKey, expanded: boolean) {
    setExpandedSections((current) => ({ ...current, [section]: expanded }));
  }

  function expandAllSections() {
    setExpandedSections({
      basics: true,
      venue: true,
      parking: true,
      schedule: true,
      dos: true,
      accommodation: true,
      notes: true,
      guestListNotes: true,
    });
  }

  function collapseAllSections() {
    setExpandedSections({
      basics: false,
      venue: false,
      parking: false,
      schedule: false,
      dos: false,
      accommodation: false,
      notes: false,
      guestListNotes: false,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isValidStoredDate(form.date)) {
      setMessage('Enter a valid date before saving. Use the date picker or YYYY-MM-DD.');
      setSaving(false);
      return;
    }

    setSaving(true);

    try {
      const generatedId = `${slugify(form.city || 'show')}-${slugify(form.venue_name || 'venue')}-${form.date || 'date'}`;
      const show = await upsertShow({ ...form, id: form.id || generatedId, tour_name: form.tour_name.trim(), region: form.region.trim().toUpperCase() });
      await loadShows();
      setDirty(false);
      window.dispatchEvent(new Event('tourbook:shows-updated'));

      if (isEditing) {
        const nextTab = isPastShow(show.date) ? 'past' : 'upcoming';
        const target = (returnToUrl.startsWith('/shows/') || returnToUrl.startsWith('/admin/dates/')) ? `${returnToUrl}${returnToUrl.includes('?') ? '&' : '?'}message=${encodeURIComponent('Show updated.')}` : `/admin/dates?tab=${nextTab}&message=${encodeURIComponent('Show updated.')}`;
        window.dispatchEvent(new Event('tourbook:shows-updated'));
        window.location.href = target;
        return;
      } else {
        resetForm('Show created. Form cleared for the next date.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save show.');
    } finally {
      setSaving(false);
    }
  }

  function loadShow(show: Show) {
    setOpenMenuId(null);

    if (mode === 'dates') {
      window.location.href = `/admin?edit=${encodeURIComponent(show.id)}&returnTo=dates&returnTab=${datesTab}`;
      return;
    }

    setVisibilityModes(visibilityModesForLoadedForm(show));
    setForm(show);
    setExpandedSections(getExpandedSectionsForPopulatedForm(show));
    setMessage('Loaded date into editor.');
    setDirty(false);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function duplicateShow(show: Show) {
    setOpenMenuId(null);

    if (mode === 'dates') {
      window.location.href = `/admin?duplicate=${encodeURIComponent(show.id)}&returnTo=dates&returnTab=${datesTab}`;
      return;
    }

    const duplicated = {
      ...show,
      id: '',
      date: '',
      created_at: undefined,
      schedule_items: show.schedule_items.map((item) => ({ ...item, id: crypto.randomUUID() })),
    };

    setVisibilityModes(visibilityModesForLoadedForm(duplicated));
    setForm(duplicated);
    setExpandedSections(getExpandedSectionsForPopulatedForm(duplicated));
    setMessage('Date duplicated into a new draft. Pick the new date and save.');
    setDirty(false);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleDelete(showId: string) {
    const confirmed = await requestConfirmation({ title: 'Delete date?', description: 'Delete this show and its guest list?', confirmLabel: 'Delete', tone: 'danger' });
    if (!confirmed) return;

    await deleteShow(showId);
    await loadShows();
    if (form.id === showId) {
      resetForm();
    }
    setOpenMenuId(null);
    setMessage('Show deleted.');
    window.dispatchEvent(new Event('tourbook:shows-updated'));
  }

  async function exportGuestList(showId: string) {
    const csv = await exportGuestListCsv(showId);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${showId}-guest-list.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setOpenMenuId(null);
  }

  const primaryActionLabel = saving ? 'Saving...' : isEditing ? 'Update' : 'Create Date';

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        tone={confirmState.tone}
        onConfirm={() => closeConfirmation(true)}
        onCancel={() => closeConfirmation(false)}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            if (mode === 'new') {
              if (dirty || isEditing) {
                const confirmed = await requestConfirmation({
                  title: 'Discard edits?',
                  description: isEditing
                    ? 'You have unsaved edits. Start a new date instead?'
                    : 'You have unsaved changes. Start a fresh new date?',
                  confirmLabel: 'Discard',
                });
                if (!confirmed) return;
              }
              resetForm('Ready to create a new date.');
              return;
            }
            window.location.href = '/admin';
          }}
          className={adminTabClassName(mode === 'new' && !isEditing)}
        >
          New Date
        </button>
        <button
          type="button"
          onClick={async () => {
            if (mode === 'new') {
              if (isEditing || dirty) {
                const confirmed = !dirty || await requestConfirmation({ title: 'Discard edits?', description: 'You have unsaved edits. Return to Existing Dates instead?', confirmLabel: 'Discard' });
                if (!confirmed) return;
                window.location.href = returnToUrl;
                return;
              }
              window.location.href = '/admin/dates';
              return;
            }
            window.location.href = '/admin/dates';
          }}
          className={adminTabClassName(mode === 'dates' || isEditing)}
        >
          Existing Dates
        </button>
      </div>

      {mode === 'new' ? (
        <section ref={formRef} className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h1 className="text-[2rem] font-semibold tracking-tight">{isEditing ? 'Edit Date' : 'New Date'}</h1>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <button
                  type="button"
                  onClick={async () => {
                    const confirmed = !dirty || await requestConfirmation({ title: 'Discard edits?', description: 'You have unsaved edits. Return instead?', confirmLabel: 'Discard' });
                    if (!confirmed) return;
                    window.location.href = returnToUrl;
                  }}
                  className={secondaryButtonClassName()}
                >
                  Cancel
                </button>
              ) : null}
              <button type="submit" form="admin-show-form" disabled={saving} className={primaryButtonClassName()}>
                {primaryActionLabel}
              </button>
            </div>
          </div>

          {message ? <p className="mb-4 text-sm text-emerald-300">{message}</p> : null}

          <div className="mb-4 flex items-center justify-end gap-3 text-xs text-zinc-500">
            <button type="button" onClick={expandAllSections} className="transition hover:text-zinc-300">
              Expand all
            </button>
            <span className="text-zinc-700">•</span>
            <button type="button" onClick={collapseAllSections} className="transition hover:text-zinc-300">
              Collapse all
            </button>
          </div>

          <form id="admin-show-form" onSubmit={handleSubmit} className="grid gap-3">
            <CollapsibleSection
              title="Basics"
              expanded={expandedSections.basics}
              onExpandedChange={(value) => setSectionExpanded('basics', value)}
              hasContent={sectionHasContent('basics', form)}
            >
              <div className="grid gap-3">
                <FlexibleDateInput label="Date" value={form.date} onChange={(value) => updateField('date', value)} />
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),180px] md:items-center">
                  <InlineInput label="City" value={form.city} onChange={(value) => updateField('city', value)} labelWidthClassName="w-[56px] md:w-[52px]" />
                  <InlineInput label="Region" value={form.region} onChange={(value) => updateField('region', value.toUpperCase())} labelWidthClassName="w-[56px] md:w-[52px]" />
                </div>
                <InlineTourInput value={form.tour_name} onChange={(value) => updateField('tour_name', value)} options={availableTours} />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Venue"
              expanded={expandedSections.venue}
              onExpandedChange={(value) => setSectionExpanded('venue', value)}
              hasContent={sectionHasContent('venue', form)}
              visibilityState={form.visibility.show_venue}
              onVisibilityToggle={(value) => updateVisibility('show_venue', value)}
            >
              <div className="grid gap-3">
                <Input label="Venue name" value={form.venue_name} onChange={(value) => updateField('venue_name', value)} />
                <AddressAutocompleteField
                  label="Venue address"
                  value={form.venue_address}
                  mapsUrl={form.venue_maps_url}
                  city={form.city}
                  region={form.region}
                  onAddressChange={(value) => updateField('venue_address', value)}
                  onMapsUrlChange={(value) => updateField('venue_maps_url', value)}
                  onRegionDetected={(value) => updateField('region', value.toUpperCase())}
                />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Load / parking info"
              expanded={expandedSections.parking}
              onExpandedChange={(value) => setSectionExpanded('parking', value)}
              hasContent={sectionHasContent('parking', form)}
              visibilityState={form.visibility.show_parking_load_info}
              onVisibilityToggle={(value) => updateVisibility('show_parking_load_info', value)}
            >
              <Textarea label="Details" value={form.parking_load_info} onChange={(value) => updateField('parking_load_info', value)} />
            </CollapsibleSection>

            <CollapsibleSection
              title="Schedule"
              expanded={expandedSections.schedule}
              onExpandedChange={(value) => setSectionExpanded('schedule', value)}
              hasContent={sectionHasContent('schedule', form)}
              visibilityState={form.visibility.show_schedule}
              onVisibilityToggle={(value) => updateVisibility('show_schedule', value)}
            >
              <div className="space-y-3">
                {form.schedule_items.map((item, index) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Line {index + 1}</p>
                      <button type="button" onClick={() => removeScheduleRow(item.id)} className={dangerButtonClassName()}>
                        Delete
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),200px] md:items-center">
                      <InlineInput label="Label" value={item.label} onChange={(value) => updateScheduleItem(item.id, 'label', value)} labelWidthClassName="w-[56px] md:w-[52px]" />
                      <InlineInput label="Time" value={item.time} onChange={(value) => updateScheduleItem(item.id, 'time', value)} labelWidthClassName="w-[56px] md:w-[52px]" />
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addScheduleRow} className={secondaryButtonClassName()}>
                  Add line
                </button>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="DOS contact"
              expanded={expandedSections.dos}
              onExpandedChange={(value) => setSectionExpanded('dos', value)}
              hasContent={sectionHasContent('dos', form)}
              visibilityState={form.visibility.show_dos_contact}
              onVisibilityToggle={(value) => updateVisibility('show_dos_contact', value)}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Name" value={form.dos_name} onChange={(value) => updateField('dos_name', value)} />
                <Input label="Phone number" value={form.dos_phone} onChange={(value) => updateField('dos_phone', value)} />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Accommodation"
              expanded={expandedSections.accommodation}
              onExpandedChange={(value) => setSectionExpanded('accommodation', value)}
              hasContent={sectionHasContent('accommodation', form)}
              visibilityState={form.visibility.show_accommodation}
              onVisibilityToggle={(value) => updateVisibility('show_accommodation', value)}
            >
              <div className="grid gap-3">
                <Input label="Hotel name" value={form.hotel_name} onChange={(value) => updateField('hotel_name', value)} />
                <AddressAutocompleteField
                  label="Hotel address"
                  value={form.hotel_address}
                  mapsUrl={form.hotel_maps_url}
                  city={form.city}
                  region={form.region}
                  onAddressChange={(value) => updateField('hotel_address', value)}
                  onMapsUrlChange={(value) => updateField('hotel_maps_url', value)}
                  onRegionDetected={(value) => updateField('region', value.toUpperCase())}
                />
                <Textarea label="Hotel notes" value={form.hotel_notes} onChange={(value) => updateField('hotel_notes', value)} />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Notes"
              expanded={expandedSections.notes}
              onExpandedChange={(value) => setSectionExpanded('notes', value)}
              hasContent={sectionHasContent('notes', form)}
              visibilityState={form.visibility.show_notes}
              onVisibilityToggle={(value) => updateVisibility('show_notes', value)}
            >
              <Textarea value={form.notes} onChange={(value) => updateField('notes', value)} ariaLabel="Notes" />
            </CollapsibleSection>

            <CollapsibleSection
              title="Guest List Notes"
              expanded={expandedSections.guestListNotes}
              onExpandedChange={(value) => setSectionExpanded('guestListNotes', value)}
              hasContent={sectionHasContent('guestListNotes', form)}
              visibilityState={form.visibility.show_guest_list_notes}
              onVisibilityToggle={(value) => updateVisibility('show_guest_list_notes', value)}
            >
              <Textarea value={form.guest_list_notes} onChange={(value) => updateField('guest_list_notes', value)} ariaLabel="Guest list notes" />
            </CollapsibleSection>

            <button type="submit" disabled={saving} className={primaryButtonClassName()}>
              {primaryActionLabel}
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5">
          {message ? <p className="mb-4 text-sm text-emerald-300">{message}</p> : null}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-[2rem] font-semibold tracking-tight">Existing Dates</h1>
            <div className="flex gap-2">
              <Link href="/admin/dates?tab=upcoming" className={adminTabClassName(datesTab === 'upcoming')}>
                Upcoming
              </Link>
              <Link href="/admin/dates?tab=past" className={adminTabClassName(datesTab === 'past')}>
                Past
              </Link>
            </div>
          </div>

          <div className="mt-4">
            {datesTab === 'past' ? (
              <ShowListSection
                title="Past dates"
                search={pastSearch}
                onSearchChange={setPastSearch}
                selectedTour={pastTour}
                onTourChange={setPastTour}
                tours={pastTours}
                shows={filteredPastShows}
                groupedShows={pastShowsByYear}
                stickyYears
                openMenuId={openMenuId}
                onToggleMenu={setOpenMenuId}
                onEdit={loadShow}
                onExport={exportGuestList}
                onDelete={handleDelete}
                onDuplicate={duplicateShow}
              />
            ) : (
              <ShowListSection
                title="Upcoming dates"
                search={upcomingSearch}
                onSearchChange={setUpcomingSearch}
                selectedTour={upcomingTour}
                onTourChange={setUpcomingTour}
                tours={upcomingTours}
                shows={filteredUpcomingShows}
                openMenuId={openMenuId}
                onToggleMenu={setOpenMenuId}
                onEdit={loadShow}
                onExport={exportGuestList}
                onDelete={handleDelete}
                onDuplicate={duplicateShow}
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function CollapsibleSection({
  title,
  expanded,
  onExpandedChange,
  hasContent,
  visibilityState,
  onVisibilityToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onExpandedChange: (value: boolean) => void;
  hasContent: boolean;
  visibilityState?: boolean;
  onVisibilityToggle?: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className={bubbleClassName()}>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => onExpandedChange(!expanded)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          {!expanded && hasContent ? (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              {typeof visibilityState === 'boolean' ? <span className="text-xs font-medium text-zinc-400">{visibilityState ? 'Visible' : 'Hidden'}</span> : null}
            </>
          ) : null}
        </button>
        <div className="flex items-center gap-2">
          {expanded && typeof visibilityState === 'boolean' && onVisibilityToggle ? <Toggle enabled={visibilityState} onToggle={onVisibilityToggle} /> : null}
          <button
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300"
            aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
          >
            <span className={`inline-block transition-transform ${expanded ? 'rotate-90' : 'rotate-0'}`}>›</span>
          </button>
        </div>
      </div>
      {expanded ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}


function ShowListSection({
  title,
  search,
  onSearchChange,
  selectedTour,
  onTourChange,
  tours,
  shows,
  groupedShows,
  stickyYears = false,
  openMenuId,
  onToggleMenu,
  onEdit,
  onExport,
  onDelete,
  onDuplicate,
}: {
  title: string;
  search: string;
  onSearchChange: (value: string) => void;
  selectedTour: string;
  onTourChange: (value: string) => void;
  tours: string[];
  shows: Show[];
  groupedShows?: Array<[string, Show[]]>;
  stickyYears?: boolean;
  openMenuId: string | null;
  onToggleMenu: (value: string | null) => void;
  onEdit: (show: Show) => void;
  onExport: (showId: string) => void;
  onDelete: (showId: string) => void;
  onDuplicate: (show: Show) => void;
}) {
  function renderShowListItem(show: Show) {
    const menuOpen = openMenuId === show.id;
    return (
      <div key={show.id} className="rounded-2xl bg-black/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/admin/dates/${show.id}?tab=${title.toLowerCase().includes('past') ? 'past' : 'upcoming'}`} className="min-w-0 flex-1 rounded-xl outline-none transition hover:opacity-95">
            <p className="text-xs uppercase tracking-wide text-zinc-400">{formatShowDate(show.date)}</p>
            <p className="text-sm font-medium">{show.city}{show.region ? `, ${show.region}` : ''}</p>
            <p className="text-sm text-zinc-300">{show.venue_name}</p>
            {show.tour_name ? <p className="mt-1 text-xs text-emerald-300">{show.tour_name}</p> : null}
          </Link>
          <div data-admin-menu-root="true" className="relative flex shrink-0 items-center gap-2 self-start">
            <button type="button" onClick={() => onEdit(show)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-transparent text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]" aria-label="Edit date">
              <PencilIcon />
            </button>
            <button type="button" onClick={() => onToggleMenu(menuOpen ? null : show.id)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-transparent text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]">
              …
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-full z-10 mt-2 min-w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
                <MenuButton label="Export guest list" onClick={() => onExport(show.id)} />
                <MenuButton label="Duplicate date" onClick={() => onDuplicate(show)} />
                <MenuButton label="Delete" destructive onClick={() => onDelete(show.id)} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4">
      <div className="space-y-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <SearchInput value={search} onChange={onSearchChange} />
          </div>
          <div className="w-[132px] shrink-0 sm:w-[180px]">
            <SelectField label="Tour" value={selectedTour} onChange={onTourChange} options={tours} compact hideLabel selectClassName={filterFieldClassName()} />
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {shows.length === 0 ? (
          <div className="rounded-2xl bg-black/20 p-3 text-sm text-zinc-400">No shows match this filter.</div>
        ) : groupedShows && groupedShows.length > 0 ? (
          groupedShows.map(([year, items]) => (
            <section key={year} className="space-y-3">
              <div className={`border-b border-white/10 py-2 text-sm font-medium tracking-wide text-zinc-400 backdrop-blur ${stickyYears ? 'sticky top-[96px] z-10 bg-zinc-950/95' : ''}`}>{year}</div>
              <div className="space-y-3">{items.map((show) => renderShowListItem(show))}</div>
            </section>
          ))
        ) : (
          shows.map((show) => renderShowListItem(show))
        )}
      </div>
    </section>
  );
}


function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Input label="Search" value={value} onChange={onChange} placeholder="Search" compact hideLabel inputClassName={filterFieldClassName()} />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
          aria-label="Clear search"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function MenuButton({ label, onClick, destructive = false }: { label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full border-b border-white/5 px-4 py-3 text-left text-sm last:border-b-0 ${destructive ? 'text-red-200' : 'text-zinc-200'}`}
    >
      {label}
    </button>
  );
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!enabled)}
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium ${enabled ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-white/10 text-zinc-300'}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${enabled ? 'bg-emerald-300' : 'bg-zinc-500'}`} />
      {enabled ? 'Show' : 'Hide'}
    </button>
  );
}

function ChevronDownIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12 20H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M16.5 3.5C17.3284 2.67157 18.6716 2.67157 19.5 3.5C20.3284 4.32843 20.3284 5.67157 19.5 6.5L8 18L4 19L5 15L16.5 3.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M8 2V5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M16 2V5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M3 9H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <rect x="3" y="4" width="18" height="17" rx="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  compact = false,
  hideLabel = false,
  inputClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  compact?: boolean;
  hideLabel?: boolean;
  inputClassName?: string;
}) {
  return (
    <label className="block text-sm text-zinc-300">
      {!hideLabel ? <span className={`block ${compact ? 'mb-1 text-sm' : 'mb-1'}`}>{label}</span> : null}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className={inputClassName ?? fieldClassName()}
      />
    </label>
  );
}


function InlineInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  labelWidthClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  labelWidthClassName?: string;
}) {
  return (
    <label className="flex items-center gap-3 text-sm text-zinc-300">
      <span className={`${labelWidthClassName ?? 'w-[72px]'} shrink-0 text-zinc-300`}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className={`${fieldClassName()} min-w-0 flex-1`}
      />
    </label>
  );
}

function FlexibleDateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const pickerId = useId();

  function commitNextValue(rawValue: string) {
    const normalized = parseFlexibleDateInput(rawValue);
    onChange(normalized || rawValue);
  }

  return (
    <div className="flex items-center gap-3 text-sm text-zinc-300">
      <label htmlFor={pickerId} className="w-[72px] shrink-0 text-zinc-300">
        {label}
      </label>
      <div className="min-w-0 flex-1">
        <input
          id={`${pickerId}-mobile`}
          type="date"
          value={parseFlexibleDateInput(value)}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          className={`${fieldClassName()} min-w-0 flex-1 md:hidden`}
        />
        <div className="relative hidden min-w-0 flex-1 md:block">
          <input
            id={pickerId}
            type="text"
            value={value}
            aria-label={label}
            onChange={(event) => onChange(event.target.value)}
            onBlur={(event) => commitNextValue(event.target.value)}
            className={`${fieldClassName()} min-w-0 flex-1 pr-12`}
          />
          <input
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-0"
            value={parseFlexibleDateInput(value)}
            onChange={(event) => onChange(event.target.value)}
          />
          <button
            type="button"
            aria-label={`Open ${label.toLowerCase()} calendar`}
            className="absolute inset-y-0 right-3 inline-flex items-center justify-center text-zinc-400 transition hover:text-zinc-200"
            onClick={(event) => {
              const wrapper = event.currentTarget.parentElement;
              const dateInput = wrapper?.querySelector('input[type="date"]') as HTMLInputElement | null;
              if (!dateInput) return;
              if (typeof dateInput.showPicker === 'function') {
                dateInput.showPicker();
              } else {
                dateInput.focus();
                dateInput.click();
              }
            }}
          >
            <CalendarIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  compact = false,
  emptyLabel,
  hideLabel = false,
  selectClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  compact?: boolean;
  emptyLabel?: string;
  hideLabel?: boolean;
  selectClassName?: string;
}) {
  return (
    <label className="block text-sm text-zinc-300">
      {!hideLabel ? <span className={`block ${compact ? 'mb-1 text-sm' : 'mb-1'}`}>{label}</span> : null}
      <div className="relative">
        <select
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          className={`${selectClassName ?? fieldClassName()} appearance-none pr-11`}
        >
          {emptyLabel ? <option value="">{emptyLabel}</option> : null}
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
          <ChevronDownIcon className="h-4 w-4" />
        </span>
      </div>
    </label>
  );
}


function InlineTourInput({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  const [creatingNew, setCreatingNew] = useState(!options.includes(value) && value.trim().length > 0);

  useEffect(() => {
    setCreatingNew(!options.includes(value) && value.trim().length > 0);
  }, [options, value]);

  const selectedValue = creatingNew ? '__new__' : value;

  return (
    <div className="space-y-2 text-sm text-zinc-300">
      <label className="flex items-center gap-3 text-sm text-zinc-300">
        <span className="w-[72px] shrink-0 text-zinc-300">Tour</span>
        <div className="relative min-w-0 flex-1">
          <select
            value={selectedValue}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue === '__new__') {
                setCreatingNew(true);
                onChange('');
                return;
              }
              setCreatingNew(false);
              onChange(nextValue);
            }}
            className={`${fieldClassName()} min-w-0 flex-1 appearance-none pr-11`}
          >
            <option value="">No tour assigned</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="__new__">Create new tour…</option>
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
            <ChevronDownIcon />
          </span>
        </div>
      </label>

      {creatingNew ? (
        <label className="flex items-center gap-3 text-sm text-zinc-300">
          <span className="w-[72px] shrink-0 text-zinc-300">New tour</span>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={`${fieldClassName()} min-w-0 flex-1`}
            placeholder="Type a new tour name"
          />
        </label>
      ) : null}
    </div>
  );
}

function TourInput({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  const [creatingNew, setCreatingNew] = useState(!options.includes(value) && value.trim().length > 0);

  useEffect(() => {
    setCreatingNew(!options.includes(value) && value.trim().length > 0);
  }, [options, value]);

  const selectedValue = creatingNew ? '__new__' : value;

  return (
    <div className="space-y-2 text-sm text-zinc-300">
      <label className="block">
        <span className="mb-1 block">Tour</span>
        <div className="relative">
          <select
            value={selectedValue}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue === '__new__') {
                setCreatingNew(true);
                onChange('');
                return;
              }
              setCreatingNew(false);
              onChange(nextValue);
            }}
            className={`${fieldClassName()} min-w-0 flex-1 appearance-none pr-11`}
          >
            <option value="">No tour assigned</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="__new__">Create new tour…</option>
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
            <ChevronDownIcon />
          </span>
        </div>
      </label>

      {creatingNew ? (
        <label className="block">
          <span className="mb-1 block">New tour name</span>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={fieldClassName()}
            placeholder="Type a new tour name"
          />
        </label>
      ) : null}
    </div>
  );
}

function Textarea({ label, value, onChange, ariaLabel }: { label?: string; value: string; onChange: (value: string) => void; ariaLabel?: string }) {
  return (
    <label className="block text-sm text-zinc-300">
      {label ? <span className="mb-1 block">{label}</span> : null}
      <textarea
        aria-label={ariaLabel ?? label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full rounded-[24px] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-emerald-400/40"
      />
    </label>
  );
}
