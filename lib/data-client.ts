'use client';

import { mapDateRecordToShow, mapScopedGuestListEntryToLegacy, mapShowFormToDateForm } from '@/lib/adapters/date-show';
import { GuestListEntry, Show, ShowFormValues } from '@/lib/types';

type ScopeInput = {
  workspaceId?: string | null;
  projectId?: string | null;
  tourId?: string | null;
};

const WORKSPACE_STORAGE_KEY = 'tourbook.activeWorkspaceId';
const PROJECT_STORAGE_KEY = 'tourbook.activeProjectId';
const TOUR_STORAGE_KEY = 'tourbook.activeTourId';

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(payload.error ?? 'Request failed');
  }

  return response.json() as Promise<T>;
}

function readStoredValue(key: string) {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(key);
}

function resolveScope(scope?: ScopeInput) {
  const workspaceId = scope?.workspaceId ?? readStoredValue(WORKSPACE_STORAGE_KEY);
  const projectId = scope?.projectId ?? readStoredValue(PROJECT_STORAGE_KEY);
  const rawTourId = scope?.tourId ?? readStoredValue(TOUR_STORAGE_KEY);
  const tourId = rawTourId || null;

  return {
    workspaceId,
    projectId,
    tourId,
  };
}

function requireWorkspaceId(scope?: ScopeInput) {
  const resolved = resolveScope(scope);
  if (!resolved.workspaceId) {
    throw new Error('No active workspace selected.');
  }
  return resolved.workspaceId;
}

function requireWorkspaceProjectScope(scope?: ScopeInput) {
  const resolved = resolveScope(scope);
  if (!resolved.workspaceId || !resolved.projectId) {
    throw new Error('No active workspace or artist selected.');
  }
  return resolved as { workspaceId: string; projectId: string; tourId: string | null };
}

export async function listShows(includeDrafts = false, scope?: ScopeInput) {
  const resolved = requireWorkspaceProjectScope(scope);
  const params = new URLSearchParams({
    workspaceId: resolved.workspaceId,
    projectId: resolved.projectId,
  });
  if (resolved.tourId) params.set('tourId', resolved.tourId);
  if (includeDrafts) params.set('includeDrafts', '1');

  const dates = await request<any[]>(`/api/dates?${params.toString()}`);
  return dates.map(mapDateRecordToShow);
}

export async function getShow(id: string, scope?: ScopeInput) {
  const workspaceId = requireWorkspaceId(scope);
  const params = new URLSearchParams({ workspaceId });
  const date = await request<any>(`/api/dates/${id}?${params.toString()}`);
  return mapDateRecordToShow(date);
}

export async function upsertShow(values: ShowFormValues, scope?: ScopeInput) {
  const resolved = requireWorkspaceProjectScope(scope);
  const payload = mapShowFormToDateForm(values, resolved);

  if (values.id) {
    const params = new URLSearchParams({ workspaceId: resolved.workspaceId });
    const date = await request<any>(`/api/dates/${values.id}?${params.toString()}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return mapDateRecordToShow(date);
  }

  const date = await request<any>('/api/dates', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return mapDateRecordToShow(date);
}

export async function deleteShow(showId: string, scope?: ScopeInput) {
  const workspaceId = requireWorkspaceId(scope);
  const params = new URLSearchParams({ workspaceId });
  await request<{ ok: boolean }>(`/api/dates/${showId}?${params.toString()}`, {
    method: 'DELETE',
  });
}

export async function listGuestListEntries(showId: string, scope?: ScopeInput) {
  const workspaceId = requireWorkspaceId(scope);
  const params = new URLSearchParams({ workspaceId });
  const entries = await request<any[]>(`/api/dates/${showId}/guest-list?${params.toString()}`);
  return entries.map(mapScopedGuestListEntryToLegacy);
}

export async function addGuestListEntries(showId: string, names: string[], scope?: ScopeInput) {
  const workspaceId = requireWorkspaceId(scope);
  const params = new URLSearchParams({ workspaceId });
  const entries = await request<any[]>(`/api/dates/${showId}/guest-list?${params.toString()}`, {
    method: 'POST',
    body: JSON.stringify({ names }),
  });
  return entries.map(mapScopedGuestListEntryToLegacy);
}

export async function updateGuestListEntry(entryId: string, name: string, scope?: ScopeInput) {
  const workspaceId = requireWorkspaceId(scope);
  const params = new URLSearchParams({ workspaceId });
  const entry = await request<any>(`/api/dates/guest-list/${entryId}?${params.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  return mapScopedGuestListEntryToLegacy(entry);
}

export async function deleteGuestListEntry(entryId: string, scope?: ScopeInput) {
  const workspaceId = requireWorkspaceId(scope);
  const params = new URLSearchParams({ workspaceId });
  await request<{ ok: boolean }>(`/api/dates/guest-list/${entryId}?${params.toString()}`, {
    method: 'DELETE',
  });
}

export async function exportGuestListCsv(showId: string, scope?: ScopeInput) {
  const workspaceId = requireWorkspaceId(scope);
  const params = new URLSearchParams({ workspaceId });
  const response = await fetch(`/api/dates/${showId}/guest-list/export?${params.toString()}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    
  });

  if (!response.ok) {
    throw new Error('Unable to export guest list');
  }

  return response.text();
}
