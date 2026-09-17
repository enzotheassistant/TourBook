'use client';

import type { GuestListEntry, Show } from '@/lib/types';

const CACHE_PREFIX = 'tourbook.offline';
const CACHE_KEY_PREFIX = `${CACHE_PREFIX}:`;
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

export function selectOfflineCacheKeysToRemove(allKeys: string[]): string[] {
  return allKeys.filter((key) => key.startsWith(CACHE_KEY_PREFIX));
}

/**
 * Removes every cached itinerary/show/guest-list entry from localStorage.
 * Call this on explicit logout -- on a shared/borrowed device, cached show
 * details (venue addresses, DOS phone numbers) and guest list names would
 * otherwise remain readable to the next person who opens the app, since
 * this cache has no expiry and survives independently of the auth session.
 */
export function clearOfflineCache() {
  if (!isBrowser()) return;

  try {
    const allKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key) allKeys.push(key);
    }
    selectOfflineCacheKeysToRemove(allKeys).forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore quota/privacy mode failures.
  }
}
