import { GuestListEntry, Show, ShowFormValues } from '@/lib/types';
import { sampleShows } from '@/lib/sample-data';

const SHOWS_KEY = 'tourbook.shows';
const GUEST_LIST_KEY = 'tourbook.guestList';

function canUseStorage() {
  return typeof window !== 'undefined';
}

export function readShowsFromStorage(): Show[] {
  if (!canUseStorage()) {
    return [...sampleShows];
  }

  const raw = window.localStorage.getItem(SHOWS_KEY);

  if (!raw) {
    window.localStorage.setItem(SHOWS_KEY, JSON.stringify(sampleShows));
    return [...sampleShows];
  }

  try {
    const parsed = JSON.parse(raw) as Show[];
    return [...parsed].sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    window.localStorage.setItem(SHOWS_KEY, JSON.stringify(sampleShows));
    return [...sampleShows];
  }
}

export function writeShowsToStorage(shows: Show[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(
    SHOWS_KEY,
    JSON.stringify([...shows].sort((a, b) => a.date.localeCompare(b.date))),
  );
}

export function saveShowToStorage(values: ShowFormValues) {
  const currentShows = readShowsFromStorage();
  const show: Show = {
    ...values,
    created_at: values.created_at ?? new Date().toISOString(),
  };

  const existingIndex = currentShows.findIndex((item) => item.id === show.id);

  if (existingIndex >= 0) {
    currentShows[existingIndex] = show;
  } else {
    currentShows.push(show);
  }

  writeShowsToStorage(currentShows);
  return show;
}

export function readGuestListFromStorage(showId: string): GuestListEntry[] {
  if (!canUseStorage()) {
    return [];
  }

  const raw = window.localStorage.getItem(GUEST_LIST_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as GuestListEntry[];
    return parsed.filter((entry) => entry.show_id === showId);
  } catch {
    return [];
  }
}

export function addGuestListEntry(showId: string, name: string): GuestListEntry {
  const entry: GuestListEntry = {
    id: crypto.randomUUID(),
    show_id: showId,
    name,
    created_at: new Date().toISOString(),
  };

  const allEntries = readAllGuestListEntries();
  allEntries.push(entry);

  if (canUseStorage()) {
    window.localStorage.setItem(GUEST_LIST_KEY, JSON.stringify(allEntries));
  }

  return entry;
}

export function readAllGuestListEntries(): GuestListEntry[] {
  if (!canUseStorage()) {
    return [];
  }

  const raw = window.localStorage.getItem(GUEST_LIST_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as GuestListEntry[];
  } catch {
    return [];
  }
}
