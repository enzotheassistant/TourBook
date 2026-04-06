'use client';

import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { deleteShow, listAllGuestListEntries, listShows, upsertShow } from '@/lib/data-client';
import { formatShowDate } from '@/lib/date';
import { Show, ShowFormValues } from '@/lib/types';

const emptyForm: ShowFormValues = {
  id: '',
  date: '',
  city: '',
  venue_name: '',
  venue_address: '',
  venue_maps_url: '',
  dos_name: '',
  dos_phone: '',
  parking_load_info: '',
  load_in: '',
  soundcheck: '',
  doors: '',
  show_time: '',
  curfew: '',
  hotel_name: '',
  hotel_address: '',
  hotel_maps_url: '',
  hotel_notes: '',
  visibility: {
    show_venue: true,
    show_dos_contact: true,
    show_parking_load_info: true,
    show_schedule: true,
    show_accommodation: true,
  },
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function bubbleClassName() {
  return 'rounded-3xl border border-white/10 bg-black/20 p-4';
}

export function AdminPageClient() {
  const [shows, setShows] = useState<Show[]>([]);
  const [form, setForm] = useState<ShowFormValues>(emptyForm);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadShows();
  }, []);

  const isEditing = useMemo(() => shows.some((show) => show.id === form.id), [form.id, shows]);

  async function loadShows() {
    const nextShows = await listShows();
    setShows(nextShows);
  }

  function updateField<K extends keyof ShowFormValues>(key: K, value: ShowFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateVisibility(key: keyof ShowFormValues['visibility'], value: boolean) {
    setForm((current) => ({
      ...current,
      visibility: {
        ...current.visibility,
        [key]: value,
      },
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setMessage('Ready to create a new show.');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const generatedId = `${slugify(form.city || 'show')}-${slugify(form.venue_name || 'venue')}-${form.date || 'date'}`;

    const show = await upsertShow({
      ...form,
      id: form.id || generatedId,
    });

    await loadShows();
    setForm(show);
    setSaving(false);
    setMessage(isEditing ? 'Show updated.' : 'Show created.');
    window.dispatchEvent(new Event('tourbook:shows-updated'));
  }

  function loadShow(show: Show) {
    setForm(show);
    setMessage('Loaded show into editor.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete(showId: string) {
    const confirmed = window.confirm('Delete this show and its guest list?');
    if (!confirmed) return;

    await deleteShow(showId);
    await loadShows();
    if (form.id === showId) {
      setForm(emptyForm);
    }
    setMessage('Show deleted.');
    window.dispatchEvent(new Event('tourbook:shows-updated'));
  }

  async function exportGuestList(showId: string) {
    const entries = (await listAllGuestListEntries()).filter((entry) => entry.show_id === showId);
    const csv = ['name,created_at', ...entries.map((entry) => `"${entry.name.replace(/"/g, '""')}","${entry.created_at}"`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${showId}-guest-list.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Admin</h1>
            <p className="text-sm text-zinc-400">Create, edit, hide, delete, and export shows.</p>
          </div>
          <button type="button" onClick={resetForm} className="rounded-2xl border border-white/10 px-3 py-2 text-sm">
            New show
          </button>
        </div>

        {message ? <p className="mb-4 text-sm text-emerald-300">{message}</p> : null}

        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className={bubbleClassName()}>
            <h2 className="text-base font-semibold">Basics</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input label="Date" value={form.date} onChange={(value) => updateField('date', value)} type="date" />
              <Input label="City" value={form.city} onChange={(value) => updateField('city', value)} />
            </div>
          </div>

          <BubbleSection title="Venue" enabled={form.visibility.show_venue} onToggle={(value) => updateVisibility('show_venue', value)}>
            <div className="grid gap-3">
              <Input label="Venue name" value={form.venue_name} onChange={(value) => updateField('venue_name', value)} />
              <Input label="Venue address" value={form.venue_address} onChange={(value) => updateField('venue_address', value)} />
              <Input label="Venue maps URL" value={form.venue_maps_url} onChange={(value) => updateField('venue_maps_url', value)} />
            </div>
          </BubbleSection>

          <BubbleSection title="DOS contact" enabled={form.visibility.show_dos_contact} onToggle={(value) => updateVisibility('show_dos_contact', value)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="DOS contact name" value={form.dos_name} onChange={(value) => updateField('dos_name', value)} />
              <Input label="DOS contact phone" value={form.dos_phone} onChange={(value) => updateField('dos_phone', value)} />
            </div>
          </BubbleSection>

          <BubbleSection title="Load / parking info" enabled={form.visibility.show_parking_load_info} onToggle={(value) => updateVisibility('show_parking_load_info', value)}>
            <Textarea label="Load / parking details" value={form.parking_load_info} onChange={(value) => updateField('parking_load_info', value)} />
          </BubbleSection>

          <BubbleSection title="Schedule" enabled={form.visibility.show_schedule} onToggle={(value) => updateVisibility('show_schedule', value)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Load-in" value={form.load_in} onChange={(value) => updateField('load_in', value)} />
              <Input label="Soundcheck" value={form.soundcheck} onChange={(value) => updateField('soundcheck', value)} />
              <Input label="Doors" value={form.doors} onChange={(value) => updateField('doors', value)} />
              <Input label="Show" value={form.show_time} onChange={(value) => updateField('show_time', value)} />
              <Input label="Curfew" value={form.curfew} onChange={(value) => updateField('curfew', value)} />
            </div>
          </BubbleSection>

          <BubbleSection title="Accommodation" enabled={form.visibility.show_accommodation} onToggle={(value) => updateVisibility('show_accommodation', value)}>
            <div className="grid gap-3">
              <Input label="Hotel name" value={form.hotel_name} onChange={(value) => updateField('hotel_name', value)} />
              <Input label="Hotel address" value={form.hotel_address} onChange={(value) => updateField('hotel_address', value)} />
              <Input label="Hotel maps URL" value={form.hotel_maps_url} onChange={(value) => updateField('hotel_maps_url', value)} />
              <Textarea label="Hotel notes" value={form.hotel_notes} onChange={(value) => updateField('hotel_notes', value)} />
            </div>
          </BubbleSection>

          <button type="submit" disabled={saving} className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-zinc-900 disabled:opacity-60">
            {saving ? 'Saving...' : isEditing ? 'Update show' : 'Create show'}
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-base font-semibold">Existing shows</h2>
        <div className="mt-3 space-y-3">
          {shows.map((show) => (
            <div key={show.id} className="rounded-2xl bg-black/20 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-400">{formatShowDate(show.date)}</p>
                  <p className="text-sm font-medium">{show.city}</p>
                  <p className="text-sm text-zinc-300">{show.venue_name}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => loadShow(show)} className="rounded-2xl border border-white/10 px-3 py-2 text-sm">
                    Edit
                  </button>
                  <button type="button" onClick={() => exportGuestList(show.id)} className="rounded-2xl bg-white px-3 py-2 text-sm font-medium text-zinc-900">
                    Export CSV
                  </button>
                  <button type="button" onClick={() => handleDelete(show.id)} className="rounded-2xl border border-red-500/40 px-3 py-2 text-sm text-red-200">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function BubbleSection({
  title,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className={bubbleClassName()}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} className="h-4 w-4" />
          Show to crew
        </label>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-sm text-zinc-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-white/20"
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-sm text-zinc-300">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-white/20"
      />
    </label>
  );
}
