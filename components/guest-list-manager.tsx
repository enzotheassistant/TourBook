"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { addGuestListEntries, deleteGuestListEntry, listGuestListEntries, updateGuestListEntry } from '@/lib/data-client';
import { GuestListEntry } from '@/lib/types';

function parseBulkInput(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function GuestListManager({ showId, note, showNote }: { showId: string; note: string; showNote: boolean }) {
  const [value, setValue] = useState('');
  const [entries, setEntries] = useState<GuestListEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      const nextEntries = await listGuestListEntries(showId);
      if (!active) return;
      setEntries(nextEntries);
    }

    load();

    return () => {
      active = false;
    };
  }, [showId]);

  const sortedEntries = useMemo(() => [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at)), [entries]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const lines = parseBulkInput(value);
    if (!lines.length || saving) return;

    setSaving(true);
    try {
      const createdEntries = await addGuestListEntries(showId, lines);
      setEntries((current) => [...current, ...createdEntries]);
      setValue('');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entryId: string) {
    await deleteGuestListEntry(entryId);
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
  }

  async function handleSaveEdit(entryId: string) {
    const trimmed = editingValue.trim();
    if (!trimmed) return;
    const updated = await updateGuestListEntry(entryId, trimmed);
    setEntries((current) => current.map((entry) => (entry.id === entryId ? updated : entry)));
    setEditingId(null);
    setEditingValue('');
  }

  return (
    <div className="space-y-4">
      {showNote && note ? <p className="text-sm text-zinc-400">{note}</p> : null}

      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="John Doe +1"
          rows={3}
          className="min-h-[96px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">Paste multiple names on separate lines to add them all at once.</p>
          <button type="submit" disabled={saving} className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-medium leading-none text-zinc-900 disabled:opacity-60">
            {saving ? 'Adding...' : 'Add'}
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {sortedEntries.length === 0 ? (
          <p className="text-sm text-zinc-400">No guest list entries yet.</p>
        ) : (
          sortedEntries.map((entry) => {
            const editing = editingId === entry.id;
            return (
              <div key={entry.id} className="rounded-2xl bg-black/20 px-4 py-3 text-sm">
                {editing ? (
                  <div className="space-y-2">
                    <input
                      value={editingValue}
                      onChange={(event) => setEditingValue(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-white/20"
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => { setEditingId(null); setEditingValue(''); }} className="rounded-2xl border border-white/10 px-3 py-2 text-sm">
                        Cancel
                      </button>
                      <button type="button" onClick={() => handleSaveEdit(entry.id)} className="rounded-2xl bg-white px-3 py-2 text-sm font-medium text-zinc-900">
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span>{entry.name}</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setEditingId(entry.id); setEditingValue(entry.name); }} className="rounded-2xl border border-white/10 px-3 py-2 text-xs text-zinc-200">
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(entry.id)} className="rounded-2xl border border-red-500/30 px-3 py-2 text-xs text-red-200">
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
