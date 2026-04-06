'use client';

import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { AddressAutocompleteField } from '@/components/address-autocomplete-field';
import { exportGuestListCsv, deleteShow, listShows, upsertShow } from '@/lib/data-client';
import { formatShowDate } from '@/lib/date';
import { emptyShowForm } from '@/lib/defaults';
import { createEmptyScheduleItems } from '@/lib/defaults';
import { Show, ShowFormValues } from '@/lib/types';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function bubbleClassName() {
  return 'rounded-3xl border border-white/10 bg-black/20 p-4';
}

export function AdminPageClient() {
  const [shows, setShows] = useState<Show[]>([]);
  const [form, setForm] = useState<ShowFormValues>(emptyShowForm);
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
    setForm({ ...emptyShowForm, schedule_items: createEmptyScheduleItems() });
    setMessage('Ready to create a new show.');
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
      const show = await upsertShow({ ...form, id: form.id || generatedId });
      await loadShows();
      setForm(show);
      setMessage(isEditing ? 'Show updated.' : 'Show created.');
      window.dispatchEvent(new Event('tourbook:shows-updated'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save show.');
    } finally {
      setSaving(false);
    }
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
      resetForm();
    }
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
            <Textarea label="Load / parking details" value={form.parking_load_info} onChange={(value) => updateField('parking_load_info', value)} />
          </BubbleSection>

          <BubbleSection title="Schedule" enabled={form.visibility.show_schedule} onToggle={(value) => updateVisibility('show_schedule', value)}>
            <div className="space-y-3">
              {form.schedule_items.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr,140px,auto] gap-2">
                  <Input label="Label" value={item.label} onChange={(value) => updateScheduleItem(item.id, 'label', value)} />
                  <Input label="Time" value={item.time} onChange={(value) => updateScheduleItem(item.id, 'time', value)} placeholder="7:30 PM or TBD" />
                  <div className="flex items-end">
                    <button type="button" onClick={() => removeScheduleRow(item.id)} className="rounded-2xl border border-white/10 px-3 py-3 text-sm">−</button>
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
              <Input label="DOS contact name" value={form.dos_name} onChange={(value) => updateField('dos_name', value)} />
              <Input label="DOS contact phone" value={form.dos_phone} onChange={(value) => updateField('dos_phone', value)} />
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
            <Textarea label="Day sheet notes" value={form.notes} onChange={(value) => updateField('notes', value)} />
          </BubbleSection>

          <BubbleSection title="Guest List Notes" enabled={form.visibility.show_guest_list_notes} onToggle={(value) => updateVisibility('show_guest_list_notes', value)}>
            <Textarea label="Guest list notes" value={form.guest_list_notes} onChange={(value) => updateField('guest_list_notes', value)} />
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
                    Export guest list
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

function BubbleSection({ title, enabled, onToggle, children }: { title: string; enabled: boolean; onToggle: (value: boolean) => void; children: ReactNode; }) {
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

function Input({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; }) {
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

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm text-zinc-300">
      <span className="mb-1 block">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
      />
    </label>
  );
}
