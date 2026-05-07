"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { addGuestListEntries, deleteGuestListEntry, listGuestListEntries, peekCachedGuestList, updateGuestListEntry } from '@/lib/data-client';
import { useAppContext } from '@/hooks/use-app-context';
import { canCreateDates, getWorkspaceRole } from '@/lib/roles';
import { GuestListEntry } from '@/lib/types';

function parseBulkInput(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function DotsIcon() {
  return <span className="text-lg leading-none">…</span>;
}

export function GuestListManager({ showId, note, showNote }: { showId: string; note: string; showNote: boolean }) {
  const { activeWorkspaceId, isLoading, memberships } = useAppContext();
  const [value, setValue] = useState('');
  const [entries, setEntries] = useState<GuestListEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      if (isLoading || !activeWorkspaceId) return;
      const cached = peekCachedGuestList(showId, { workspaceId: activeWorkspaceId });
      if (cached && active) {
        setEntries(cached.data);
      }

      try {
        const nextEntries = await listGuestListEntries(showId, { workspaceId: activeWorkspaceId });
        if (!active) return;
        setEntries(nextEntries);
        setError('');
      } catch (err) {
        if (!active || cached) return;
        setError(err instanceof Error ? err.message : 'Unable to load guest list.');
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [showId, activeWorkspaceId, isLoading]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-guest-menu-root="true"]')) return;
      setOpenMenuId(null);
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const sortedEntries = useMemo(() => [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at)), [entries]);
  const workspaceRole = useMemo(() => getWorkspaceRole(memberships, activeWorkspaceId), [memberships, activeWorkspaceId]);
  const canManageGuestList = canCreateDates(workspaceRole);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lines = parseBulkInput(value);
    if (!canManageGuestList) {
      setError('You have view-only access in this workspace. Ask an editor, admin, or owner to update the guest list.');
      return;
    }
    if (!lines.length || saving) return;
    setSaving(true);
    setError('');
    try {
      const createdEntries = await addGuestListEntries(showId, lines, { workspaceId: activeWorkspaceId });
      setEntries((current) => [...current, ...createdEntries]);
      setValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add guest list entry.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entryId: string) {
    if (!canManageGuestList) {
      setError('You have view-only access in this workspace. Ask an editor, admin, or owner to update the guest list.');
      return;
    }
    setError('');
    try {
      await deleteGuestListEntry(entryId, { workspaceId: activeWorkspaceId, showId });
      setEntries((current) => current.filter((entry) => entry.id !== entryId));
      setOpenMenuId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove guest list entry.');
    }
  }

  async function handleSaveEdit(entryId: string) {
    if (!canManageGuestList) {
      setError('You have view-only access in this workspace. Ask an editor, admin, or owner to update the guest list.');
      return;
    }
    const trimmed = editingValue.trim();
    if (!trimmed) return;
    setError('');
    try {
      const updated = await updateGuestListEntry(entryId, trimmed, { workspaceId: activeWorkspaceId });
      setEntries((current) => current.map((entry) => (entry.id === entryId ? updated : entry)));
      setEditingId(null);
      setEditingValue('');
      setOpenMenuId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update guest list entry.');
    }
  }

  return (
    <div className="space-y-5">
      {showNote && note ? <p className="text-sm text-zinc-400">{note}</p> : null}

      {canManageGuestList ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="John Doe +1"
            rows={3}
            className="min-h-[104px] w-full rounded-[24px] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-sky-400/40"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">Paste multiple names on separate lines to add them all at once.</p>
            <button type="submit" disabled={saving} className="inline-flex h-11 items-center justify-center rounded-full bg-sky-500 px-5 text-sm font-medium text-zinc-950 disabled:opacity-60">
              {saving ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-[24px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-300">
          You have view-only access in this workspace. Ask an editor, admin, or owner to update the guest list.
        </div>
      )}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <div className="space-y-2">
        {sortedEntries.length === 0 ? (
          <p className="text-sm text-zinc-400">No guest list entries yet.</p>
        ) : (
          sortedEntries.map((entry) => {
            const editing = editingId === entry.id;
            const menuOpen = openMenuId === entry.id;
            return (
              <div key={entry.id} className="rounded-[24px] bg-black/20 px-4 py-3 text-sm">
                {editing ? (
                  <div className="space-y-2">
                    <input
                      value={editingValue}
                      onChange={(event) => setEditingValue(event.target.value)}
                      className="h-11 w-full rounded-full border border-white/10 bg-black/20 px-4 text-sm outline-none focus:border-sky-400/40"
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => { setEditingId(null); setEditingValue(''); }} className="inline-flex h-10 items-center rounded-full border border-white/10 px-4 text-sm text-zinc-300">
                        Cancel
                      </button>
                      <button type="button" onClick={() => handleSaveEdit(entry.id)} className="inline-flex h-10 items-center rounded-full bg-sky-500 px-4 text-sm font-medium text-zinc-950">
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-zinc-100">{entry.name}</span>
                    {canManageGuestList ? (
                      <div data-guest-menu-root="true" className="relative">
                        <button type="button" onClick={() => setOpenMenuId(menuOpen ? null : entry.id)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.05]">
                          <DotsIcon />
                        </button>
                        {menuOpen ? (
                          <div className="absolute right-0 top-full z-10 mt-2 min-w-[170px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
                            <button type="button" onClick={() => { setEditingId(entry.id); setEditingValue(entry.name); setOpenMenuId(null); }} className="block w-full border-b border-white/5 px-4 py-3 text-left text-sm text-zinc-200">
                              Edit
                            </button>
                            <button type="button" onClick={() => handleDelete(entry.id)} className="block w-full px-4 py-3 text-left text-sm text-red-200">
                              Remove
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
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
