import { GuestListEntry, Show, ShowFormValues, ShowVisibility } from '@/lib/types';
import { sampleShows } from '@/lib/sample-data';

const SHOWS_KEY = 'tourbook.shows';
const GUEST_LIST_KEY = 'tourbook.guestList';

const defaultVisibility: ShowVisibility = {
  show_venue: true,
  show_dos_contact: true,
  show_parking_load_info: true,
  show_schedule: true,
  show_accommodation: true,
};

function canUseStorage() {
  return typeof window !== 'undefined';
}

function normalizeShow(show: ShowFormValues | Show): Show {
  return {
    ...show,
    created_at: show.created_at ?? new Date().toISOString(),
    visibility: {
      ...defaultVisibility,
      ...(show.visibility ?? {}),
    },
  };
}

export function readShowsFromStorage(): Show[] {
  if (!canUseStorage()) {
    return [...sampleShows].map(normalizeShow);
  }

  const raw = window.localStorage.getItem(SHOWS_KEY);

  if (!raw) {
    const normalized = sampleShows.map(normalizeShow);
    window.localStorage.setItem(SHOWS_KEY, JSON.stringify(normalized));
    return normalized;
  }

  try {
    const parsed = JSON.parse(raw) as Show[];
    return [...parsed].map(normalizeShow).sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    const normalized = sampleShows.map(normalizeShow);
    window.localStorage.setItem(SHOWS_KEY, JSON.stringify(normalized));
    return normalized;
  }
}

export function writeShowsToStorage(shows: Show[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(
    SHOWS_KEY,
    JSON.stringify([...shows].map(normalizeShow).sort((a, b) => a.date.localeCompare(b.date))),
  );
}

export function saveShowToStorage(values: ShowFormValues) {
  const currentShows = readShowsFromStorage();
  const show = normalizeShow(values);

  const existingIndex = currentShows.findIndex((item) => item.id === show.id);

  if (existingIndex >= 0) {
    currentShows[existingIndex] = show;
  } else {
    currentShows.push(show);
  }

  writeShowsToStorage(currentShows);
  return show;
}

export function deleteShowFromStorage(showId: string) {
  const nextShows = readShowsFromStorage().filter((show) => show.id !== showId);
  writeShowsToStorage(nextShows);

  const remainingGuestList = readAllGuestListEntries().filter((entry) => entry.show_id !== showId);
  if (canUseStorage()) {
    window.localStorage.setItem(GUEST_LIST_KEY, JSON.stringify(remainingGuestList));
  }
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

export function addGuestListEntryToStorage(showId: string, name: string): GuestListEntry {
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
