'use client';

import Link from 'next/link';
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AddressAutocompleteField } from '@/components/address-autocomplete-field';
import { deleteShow, exportGuestListCsv, listShows, upsertShow } from '@/lib/data-client';
import { formatShowDate, isPastShow } from '@/lib/date';
import { createEmptyScheduleItems, emptyShowForm } from '@/lib/defaults';
import { Show, ShowFormValues } from '@/lib/types';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function bubbleClassName() {
  return 'rounded-3xl border border-white/10 bg-black/20 p-4';
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

export function AdminPageClient({ mode = 'new' }: { mode?: 'new' | 'dates' }) {
  const searchParams = useSearchParams();
  const datesTab = searchParams.get('tab') === 'past' ? 'past' : 'upcoming';
  const [shows, setShows] = useState<Show[]>([]);
  const [form, setForm] = useState<ShowFormValues>(emptyShowForm);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [upcomingSearch, setUpcomingSearch] = useState('');
  const [pastSearch, setPastSearch] = useState('');
  const [upcomingTour, setUpcomingTour] = useState('All');
  const [pastTour, setPastTour] = useState('All');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadShows();
  }, []);

  useEffect(() => {
    function closeMenu() {
      setOpenMenuId(null);
    }
    window.addEventListener('scroll', closeMenu);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('scroll', closeMenu);
      window.removeEventListener('resize', closeMenu);
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

  useEffect(() => {
    if (!upcomingTours.includes(upcomingTour)) setUpcomingTour('All');
  }, [upcomingTour, upcomingTours]);

  useEffect(() => {
    if (!pastTours.includes(pastTour)) setPastTour('All');
  }, [pastTour, pastTours]);

  useEffect(() => {
    if (mode !== 'new') return;

    const editId = searchParams.get('edit');
    const duplicateId = searchParams.get('duplicate');
    if (!shows.length) return;

    if (duplicateId) {
      const source = shows.find((show) => show.id === duplicateId);
      if (source) {
        setForm({
          ...source,
          id: '',
          date: '',
          created_at: undefined,
          schedule_items: source.schedule_items.map((item) => ({ ...item, id: crypto.randomUUID() })),
        });
        setMessage('Date duplicated into a new draft. Pick the new date and save.');
      }
      return;
    }

    if (editId) {
      const source = shows.find((show) => show.id === editId);
      if (source) {
        setForm(source);
        setMessage('Loaded date into editor.');
      }
    }
  }, [mode, searchParams, shows]);

  async function loadShows() {
    const nextShows = await listShows();
    setShows(nextShows);
  }

  function updateField<K extends keyof ShowFormValues>(key: K, value: ShowFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateVisibility(key: keyof ShowFormValues['visibility'], value: boolean) {
    setForm((current) => ({ ...current, visibility: { ...current.visibility, [key]: value } }));
  }

  function resetForm(nextMessage = 'Ready to create a new date.') {
    setForm({ ...emptyShowForm, schedule_items: createEmptyScheduleItems() });
    setMessage(nextMessage);
  }

  function updateScheduleItem(id: string, field: 'label' | 'time', value: string) {
    setForm((current) => ({
      ...current,
      schedule_items: current.schedule_items.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  }

  function addScheduleRow() {
    setForm((current) => ({
      ...current,
      schedule_items: [...current.schedule_items, { id: crypto.randomUUID(), label: '', time: '' }],
    }));
  }

  function removeScheduleRow(id: string) {
    setForm((current) => ({
      ...current,
      schedule_items: current.schedule_items.filter((item) => item.id !== id),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    try {
      const generatedId = `${slugify(form.city || 'show')}-${slugify(form.venue_name || 'venue')}-${form.date || 'date'}`;
      const show = await upsertShow({ ...form, id: form.id || generatedId, tour_name: form.tour_name.trim() });
      await loadShows();
      window.dispatchEvent(new Event('tourbook:shows-updated'));

      if (isEditing) {
        setForm(show);
        setMessage('Show updated.');
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
      window.location.href = `/admin?edit=${encodeURIComponent(show.id)}`;
      return;
    }

    setForm(show);
    setMessage('Loaded date into editor.');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function duplicateShow(show: Show) {
    setOpenMenuId(null);

    if (mode === 'dates') {
      window.location.href = `/admin?duplicate=${encodeURIComponent(show.id)}`;
      return;
    }

    setForm({
      ...show,
      id: '',
      date: '',
      created_at: undefined,
      schedule_items: show.schedule_items.map((item) => ({ ...item, id: crypto.randomUUID() })),
    });
    setMessage('Date duplicated into a new draft. Pick the new date and save.');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleDelete(showId: string) {
    const confirmed = window.confirm('Delete this show and its guest list?');
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link href="/admin" className={adminTabClassName(mode === 'new')}>
          New Date
        </Link>
        <Link href="/admin/dates" className={adminTabClassName(mode === 'dates')}>
          Existing Dates
        </Link>
      </div>

      {mode === 'new' ? (
        <section ref={formRef} className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">New Date</h1>
              <p className="text-sm text-zinc-400">Create a new tour date, then keep rolling into the next one.</p>
            </div>
            <button type="submit" form="admin-show-form" disabled={saving} className="rounded-2xl border border-white/10 px-3 py-2 text-sm disabled:opacity-60">
              {saving ? 'Saving...' : isEditing ? 'Update show' : 'Create show'}
            </button>
          </div>

          {message ? <p className="mb-4 text-sm text-emerald-300">{message}</p> : null}

          <form id="admin-show-form" onSubmit={handleSubmit} className="grid gap-3">
            <div className={bubbleClassName()}>
              <h2 className="text-base font-semibold">Basics</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input label="Date" value={form.date} onChange={(value) => updateField('date', value)} type="date" />
                <Input label="City" value={form.city} onChange={(value) => updateField('city', value)} />
                <TourInput value={form.tour_name} onChange={(value) => updateField('tour_name', value)} options={availableTours} />
              </div>
            </div>

            <BubbleSection title="Venue" enabled={form.visibility.show_venue} onToggle={(value) => updateVisibility('show_venue', value)}>
              <div className="grid gap-3">
                <Input label="Venue name" value={form.venue_name} onChange={(value) => updateField('venue_name', value)} />
                <AddressAutocompleteField
                  label="Venue address"
                  value={form.venue_address}
                  mapsUrl={form.venue_maps_url}
                  onAddressChange={(value) => updateField('venue_address', value)}
                  onMapsUrlChange={(value) => updateField('venue_maps_url', value)}
                />
              </div>
            </BubbleSection>

            <BubbleSection title="Load / parking info" enabled={form.visibility.show_parking_load_info} onToggle={(value) => updateVisibility('show_parking_load_info', value)}>
              <Textarea label="Details" value={form.parking_load_info} onChange={(value) => updateField('parking_load_info', value)} />
            </BubbleSection>

            <BubbleSection title="Schedule" enabled={form.visibility.show_schedule} onToggle={(value) => updateVisibility('show_schedule', value)}>
              <div className="space-y-3">
                {form.schedule_items.map((item, index) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Line {index + 1}</p>
                      <button type="button" onClick={() => removeScheduleRow(item.id)} className="rounded-full border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-200">
                        Delete
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),140px]">
                      <Input label="Label" value={item.label} onChange={(value) => updateScheduleItem(item.id, 'label', value)} />
                      <Input label="Time" value={item.time} onChange={(value) => updateScheduleItem(item.id, 'time', value)} placeholder="7:30 PM or TBD" />
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addScheduleRow} className="rounded-2xl border border-white/10 px-3 py-3 text-sm">
                  Add line
                </button>
              </div>
            </BubbleSection>

            <BubbleSection title="DOS contact" enabled={form.visibility.show_dos_contact} onToggle={(value) => updateVisibility('show_dos_contact', value)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Name" value={form.dos_name} onChange={(value) => updateField('dos_name', value)} />
                <Input label="Phone number" value={form.dos_phone} onChange={(value) => updateField('dos_phone', value)} />
              </div>
            </BubbleSection>

            <BubbleSection title="Accommodation" enabled={form.visibility.show_accommodation} onToggle={(value) => updateVisibility('show_accommodation', value)}>
              <div className="grid gap-3">
                <Input label="Hotel name" value={form.hotel_name} onChange={(value) => updateField('hotel_name', value)} />
                <AddressAutocompleteField
                  label="Hotel address"
                  value={form.hotel_address}
                  mapsUrl={form.hotel_maps_url}
                  onAddressChange={(value) => updateField('hotel_address', value)}
                  onMapsUrlChange={(value) => updateField('hotel_maps_url', value)}
                />
                <Textarea label="Hotel notes" value={form.hotel_notes} onChange={(value) => updateField('hotel_notes', value)} />
              </div>
            </BubbleSection>

            <BubbleSection title="Notes" enabled={form.visibility.show_notes} onToggle={(value) => updateVisibility('show_notes', value)}>
              <Textarea value={form.notes} onChange={(value) => updateField('notes', value)} ariaLabel="Notes" />
            </BubbleSection>

            <BubbleSection title="Guest List Notes" enabled={form.visibility.show_guest_list_notes} onToggle={(value) => updateVisibility('show_guest_list_notes', value)}>
              <Textarea value={form.guest_list_notes} onChange={(value) => updateField('guest_list_notes', value)} ariaLabel="Guest list notes" />
            </BubbleSection>

            <button type="submit" disabled={saving} className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-zinc-900 disabled:opacity-60">
              {saving ? 'Saving...' : isEditing ? 'Update show' : 'Create show'}
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Existing Dates</h1>
              <p className="text-sm text-zinc-400">Filter your upcoming and past dates without crowding the new-date form.</p>
            </div>
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

function BubbleSection({ title, enabled, onToggle, children }: { title: string; enabled: boolean; onToggle: (value: boolean) => void; children: ReactNode }) {
  return (
    <section className={bubbleClassName()}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <Toggle enabled={enabled} onToggle={onToggle} />
      </div>
      <div className="mt-3">{children}</div>
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
  openMenuId: string | null;
  onToggleMenu: (value: string | null) => void;
  onEdit: (show: Show) => void;
  onExport: (showId: string) => void;
  onDelete: (showId: string) => void;
  onDuplicate: (show: Show) => void;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),180px]">
          <Input label="Search" value={search} onChange={onSearchChange} placeholder="Search city, venue, or date" />
          <label className="block text-sm text-zinc-300">
            <span className="mb-1 block">Tour</span>
            <select value={selectedTour} onChange={(event) => onTourChange(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-white/20">
              {tours.map((tour) => (
                <option key={tour} value={tour}>{tour}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {shows.length === 0 ? (
          <div className="rounded-2xl bg-black/20 p-3 text-sm text-zinc-400">No shows match this filter.</div>
        ) : (
          shows.map((show) => {
            const menuOpen = openMenuId === show.id;
            return (
              <div key={show.id} className="rounded-2xl bg-black/20 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-zinc-400">{formatShowDate(show.date)}</p>
                    <p className="text-sm font-medium">{show.city}</p>
                    <p className="text-sm text-zinc-300">{show.venue_name}</p>
                    {show.tour_name ? <p className="mt-1 text-xs text-emerald-300">{show.tour_name}</p> : null}
                  </div>
                  <div className="relative flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => onEdit(show)} className="rounded-2xl border border-white/10 px-3 py-2 text-sm">
                      Edit
                    </button>
                    <button type="button" onClick={() => onToggleMenu(menuOpen ? null : show.id)} className="rounded-2xl border border-white/10 px-3 py-2 text-sm">
                      …
                    </button>
                    {menuOpen ? (
                      <div className="right-0 top-full z-10 min-w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:absolute">
                        <MenuButton label="Export guest list" onClick={() => onExport(show.id)} />
                        <MenuButton label="Duplicate date" onClick={() => onDuplicate(show)} />
                        <MenuButton label="Delete" destructive onClick={() => onDelete(show.id)} />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
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
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${enabled ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-white/10 text-zinc-300'}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${enabled ? 'bg-emerald-300' : 'bg-zinc-500'}`} />
      {enabled ? 'Show' : 'Hide'}
    </button>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block text-sm text-zinc-300">
      <span className="mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
      />
    </label>
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
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-white/20"
        >
          <option value="">No tour assigned</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value="__new__">Create new tour…</option>
        </select>
      </label>

      {creatingNew ? (
        <label className="block">
          <span className="mb-1 block">New tour name</span>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
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
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
      />
    </label>
  );
}
