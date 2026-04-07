import { sampleShows } from '@/lib/sample-data';
import { normalizeShow, sortGuestListEntries, sortShows } from '@/lib/normalize';
import { GuestListEntry, Show, ShowFormValues } from '@/lib/types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabaseServerClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const memory = {
  shows: sampleShows.map((show) => normalizeShow(show)),
  guestList: [] as GuestListEntry[],
};

function cloneShows() {
  return memory.shows.map((show) => normalizeShow(show));
}

export async function listShowsServer(): Promise<Show[]> {
  if (!isSupabaseConfigured()) {
    return sortShows(cloneShows(), true);
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return sortShows(cloneShows(), true);
  }

  const { data, error } = await supabase.from('shows').select('*').order('date', { ascending: true });
  if (error || !data) {
    return sortShows(cloneShows(), true);
  }

  return sortShows((data as Show[]).map(normalizeShow), true);
}

export async function getShowServer(id: string): Promise<Show | null> {
  const shows = await listShowsServer();
  return shows.find((show) => show.id === id) ?? null;
}

export async function upsertShowServer(values: ShowFormValues): Promise<Show> {
  const normalized = normalizeShow(values);

  if (!isSupabaseConfigured()) {
    const index = memory.shows.findIndex((show) => show.id === normalized.id);
    if (index >= 0) {
      memory.shows[index] = normalized;
    } else {
      memory.shows.push(normalized);
    }
    memory.shows = sortShows(memory.shows, true);
    return normalized;
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return normalized;
  }

  try {
  const { data, error } = await supabase
    .from('shows')
    .upsert(normalized)
    .select()
    .single();

  if (error || !data) {
    console.error('SUPABASE UPSERT ERROR:', error, 'PAYLOAD:', normalized);
    throw new Error(error?.message ?? 'Unable to save show');
  }

  return normalizeShow(data as Show);
} catch (err) {
  console.error('UPSERT SHOW SERVER FAILED:', err, 'PAYLOAD:', normalized);
  throw err;
}

  return normalizeShow(data as Show);
}

export async function deleteShowServer(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    memory.shows = memory.shows.filter((show) => show.id !== id);
    memory.guestList = memory.guestList.filter((entry) => entry.show_id !== id);
    return;
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const { error } = await supabase.from('shows').delete().eq('id', id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function listGuestListEntriesServer(showId: string): Promise<GuestListEntry[]> {
  if (!isSupabaseConfigured()) {
    return sortGuestListEntries(memory.guestList.filter((entry) => entry.show_id === showId));
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('guest_list_entries')
    .select('*')
    .eq('show_id', showId)
    .order('created_at', { ascending: true });

  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to load guest list');
  }

  return data as GuestListEntry[];
}

export async function listAllGuestListEntriesServer(): Promise<GuestListEntry[]> {
  if (!isSupabaseConfigured()) {
    return sortGuestListEntries(memory.guestList);
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase.from('guest_list_entries').select('*').order('created_at', { ascending: true });
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to load guest list');
  }

  return data as GuestListEntry[];
}

export async function addGuestListEntriesServer(showId: string, names: string[]): Promise<GuestListEntry[]> {
  const payload = names.filter(Boolean).map((name) => ({
    id: crypto.randomUUID(),
    show_id: showId,
    name,
    created_at: new Date().toISOString(),
  }));

  if (!isSupabaseConfigured()) {
    memory.guestList.push(...payload);
    return sortGuestListEntries(payload);
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return payload;
  }

  const { data, error } = await supabase.from('guest_list_entries').insert(payload).select();
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to add guest list entries');
  }

  return data as GuestListEntry[];
}

export async function updateGuestListEntryServer(id: string, name: string): Promise<GuestListEntry> {
  if (!isSupabaseConfigured()) {
    const entry = memory.guestList.find((item) => item.id === id);
    if (!entry) {
      throw new Error('Guest list entry not found');
    }
    entry.name = name;
    return entry;
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  const { data, error } = await supabase.from('guest_list_entries').update({ name }).eq('id', id).select().single();
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update guest list entry');
  }

  return data as GuestListEntry;
}

export async function deleteGuestListEntryServer(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    memory.guestList = memory.guestList.filter((item) => item.id !== id);
    return;
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from('guest_list_entries').delete().eq('id', id);
  if (error) {
    throw new Error(error.message);
  }
}
