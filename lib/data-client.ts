'use client';

import {
  addGuestListEntryToStorage,
  deleteShowFromStorage,
  readAllGuestListEntries,
  readGuestListFromStorage,
  readShowsFromStorage,
  saveShowToStorage,
} from '@/lib/local-storage';
import { getSupabaseBrowserClient, isSupabaseEnabled } from '@/lib/supabase';
import { GuestListEntry, Show, ShowFormValues } from '@/lib/types';

function sortedShows(shows: Show[]) {
  return [...shows].sort((a, b) => a.date.localeCompare(b.date));
}

export async function listShows(): Promise<Show[]> {
  if (!isSupabaseEnabled()) {
    return readShowsFromStorage();
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return readShowsFromStorage();
  }

  const { data, error } = await supabase.from('shows').select('*').order('date', { ascending: true });
  if (error || !data) {
    return readShowsFromStorage();
  }

  return sortedShows(data as Show[]);
}

export async function upsertShow(values: ShowFormValues): Promise<Show> {
  const fallbackShow = saveShowToStorage(values);

  if (!isSupabaseEnabled()) {
    return fallbackShow;
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return fallbackShow;
  }

  const { data, error } = await supabase.from('shows').upsert(fallbackShow).select().single();
  if (error || !data) {
    return fallbackShow;
  }

  return data as Show;
}

export async function deleteShow(showId: string) {
  deleteShowFromStorage(showId);

  if (!isSupabaseEnabled()) {
    return;
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return;
  }

  await supabase.from('shows').delete().eq('id', showId);
  await supabase.from('guest_list_entries').delete().eq('show_id', showId);
}

export async function listGuestListEntries(showId: string): Promise<GuestListEntry[]> {
  if (!isSupabaseEnabled()) {
    return readGuestListFromStorage(showId);
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return readGuestListFromStorage(showId);
  }

  const { data, error } = await supabase
    .from('guest_list_entries')
    .select('*')
    .eq('show_id', showId)
    .order('created_at', { ascending: true });

  if (error || !data) {
    return readGuestListFromStorage(showId);
  }

  return data as GuestListEntry[];
}

export async function addGuestListEntry(showId: string, name: string): Promise<GuestListEntry> {
  const fallbackEntry = addGuestListEntryToStorage(showId, name);

  if (!isSupabaseEnabled()) {
    return fallbackEntry;
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return fallbackEntry;
  }

  const payload = {
    id: fallbackEntry.id,
    show_id: showId,
    name,
    created_at: fallbackEntry.created_at,
  };

  const { data, error } = await supabase.from('guest_list_entries').insert(payload).select().single();
  if (error || !data) {
    return fallbackEntry;
  }

  return data as GuestListEntry;
}

export async function listAllGuestListEntries(): Promise<GuestListEntry[]> {
  if (!isSupabaseEnabled()) {
    return readAllGuestListEntries();
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return readAllGuestListEntries();
  }

  const { data, error } = await supabase.from('guest_list_entries').select('*');
  if (error || !data) {
    return readAllGuestListEntries();
  }

  return data as GuestListEntry[];
}
