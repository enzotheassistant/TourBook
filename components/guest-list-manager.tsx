'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { addGuestListEntry, listGuestListEntries } from '@/lib/data-client';
import { GuestListEntry } from '@/lib/types';

export function GuestListManager({ showId }: { showId: string }) {
  const [value, setValue] = useState('');
  const [entries, setEntries] = useState<GuestListEntry[]>([]);
  const [saving, setSaving] = useState(false);

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

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [entries],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = value.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    const entry = await addGuestListEntry(showId, trimmed);
    setEntries((current) => [...current.filter((item) => item.id !== entry.id), entry]);
    setValue('');
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="John Doe +1"
          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-zinc-900 disabled:opacity-60"
        >
          {saving ? 'Adding...' : 'Add'}
        </button>
      </form>

      <div className="space-y-2">
        {sortedEntries.length === 0 ? (
          <p className="text-sm text-zinc-400">No guest list entries yet.</p>
        ) : (
          sortedEntries.map((entry) => (
            <div key={entry.id} className="rounded-2xl bg-black/20 px-4 py-3 text-sm">
              {entry.name}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
