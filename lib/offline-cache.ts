'use client';

import type { GuestListEntry, Show } from '@/lib/types';

const CACHE_PREFIX = 'tourbook.offline';
const CACHE_VERSION = 'v2';

type CachedPayload<T> = {
  version: string;
  savedAt: string;
  data: T;
};

function isBrowser() {
  return typeof window !== 'undefined';
}

function readStorage(key: string) {
  if (!isBrowser()) return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  if (!isBrowser()) return;

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore quota/privacy mode failures.
  }
}

function parseCachedPayload<T>(raw: string | null): CachedPayload<T> | null {
  if (!raw) return null;

  try {
    const payload = JSON.parse(raw) as CachedPayload<T>;
    if (payload.version !== CACHE_VERSION || !payload.savedAt) return null;
    const savedAtMs = new Date(payload.savedAt).getTime();
    if (!Number.isFinite(savedAtMs)) return null;
    return payload;
  } catch {
    return null;
  }
}

function writeCachedPayload<T>(key: string, data: T) {
  writeStorage(key, JSON.stringify({ version: CACHE_VERSION, savedAt: new Date().toISOString(), data } satisfies CachedPayload<T>));
}

function itineraryKey(scope: { workspaceId: string; projectId: string; tourId?: string | null; includeDrafts?: boolean }) {
  return [CACHE_PREFIX, 'itinerary', scope.workspaceId, scope.projectId, scope.tourId || 'all', scope.includeDrafts ? 'drafts' : 'published'].join(':');
}

function dayKey(scope: { workspaceId: string; showId: string }) {
  return [CACHE_PREFIX, 'day', scope.workspaceId, scope.showId].join(':');
}

function guestListKey(scope: { workspaceId: string; showId: string }) {
  return [CACHE_PREFIX, 'guest-list', scope.workspaceId, scope.showId].join(':');
}

export function readCachedItinerary(scope: { workspaceId: string; projectId: string; tourId?: string | null; includeDrafts?: boolean }) {
  return parseCachedPayload<Show[]>(readStorage(itineraryKey(scope)));
}

export function writeCachedItinerary(scope: { workspaceId: string; projectId: string; tourId?: string | null; includeDrafts?: boolean }, shows: Show[]) {
  writeCachedPayload(itineraryKey(scope), shows);
}

export function readCachedShow(scope: { workspaceId: string; showId: string }) {
  return parseCachedPayload<Show>(readStorage(dayKey(scope)));
}

export function writeCachedShow(scope: { workspaceId: string; showId: string }, show: Show) {
  writeCachedPayload(dayKey(scope), show);
}

export function readCachedGuestList(scope: { workspaceId: string; showId: string }) {
  return parseCachedPayload<GuestListEntry[]>(readStorage(guestListKey(scope)));
}

export function writeCachedGuestList(scope: { workspaceId: string; showId: string }, entries: GuestListEntry[]) {
  writeCachedPayload(guestListKey(scope), entries);
}
