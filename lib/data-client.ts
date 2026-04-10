'use client';

import { AiIntakeImageInput, AiIntakeResponse, GuestListEntry, Show, ShowFormValues } from '@/lib/types';

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(payload.error ?? 'Request failed');
  }

  return response.json() as Promise<T>;
}

export function listShows(includeDrafts = false) {
  const query = includeDrafts ? '?includeDrafts=1' : '';
  return request<Show[]>(`/api/shows${query}`);
}

export function getShow(id: string) {
  return request<Show>(`/api/shows/${id}`);
}

export function upsertShow(values: ShowFormValues) {
  if (values.id) {
    return request<Show>(`/api/shows/${values.id}`, {
      method: 'PUT',
      body: JSON.stringify(values),
    });
  }

  return request<Show>('/api/shows', {
    method: 'POST',
    body: JSON.stringify(values),
  });
}

export async function deleteShow(showId: string) {
  await request<{ ok: boolean }>(`/api/shows/${showId}`, {
    method: 'DELETE',
  });
}

export function listGuestListEntries(showId: string) {
  return request<GuestListEntry[]>(`/api/shows/${showId}/guest-list`);
}

export function addGuestListEntries(showId: string, names: string[]) {
  return request<GuestListEntry[]>(`/api/shows/${showId}/guest-list`, {
    method: 'POST',
    body: JSON.stringify({ names }),
  });
}

export function updateGuestListEntry(entryId: string, name: string) {
  return request<GuestListEntry>(`/api/guest-list/${entryId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteGuestListEntry(entryId: string) {
  await request<{ ok: boolean }>(`/api/guest-list/${entryId}`, {
    method: 'DELETE',
  });
}

export async function exportGuestListCsv(showId: string) {
  const response = await fetch(`/api/shows/${showId}/guest-list/export`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to export guest list');
  }
  return response.text();
}


export function requestAiIntake(payload: { source_text: string; images: AiIntakeImageInput[] }) {
  return request<AiIntakeResponse>('/api/ai-intake', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
