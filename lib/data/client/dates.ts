'use client';

import type { DateFormValues, DateRecord, ScopedGuestListEntry } from '@/lib/types/date-record';
import type { IntakeResult } from '@/lib/ai/intake-types';

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(payload.error ?? 'Request failed');
  }

  return response.json() as Promise<T>;
}

export function listDates(input: { workspaceId: string; projectId: string; tourId?: string | null; includeDrafts?: boolean }) {
  const params = new URLSearchParams({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  });
  if (input.tourId) params.set('tourId', input.tourId);
  if (input.includeDrafts) params.set('includeDrafts', '1');
  return request<DateRecord[]>(`/api/dates?${params.toString()}`);
}

export function getDate(workspaceId: string, dateId: string) {
  const params = new URLSearchParams({ workspaceId });
  return request<DateRecord>(`/api/dates/${dateId}?${params.toString()}`);
}

export function createDate(values: Partial<DateFormValues>) {
  return request<DateRecord>('/api/dates', {
    method: 'POST',
    body: JSON.stringify(values),
  });
}

export function updateDate(workspaceId: string, dateId: string, values: Partial<DateFormValues>) {
  const params = new URLSearchParams({ workspaceId });
  return request<DateRecord>(`/api/dates/${dateId}?${params.toString()}`, {
    method: 'PUT',
    body: JSON.stringify(values),
  });
}

export async function deleteDate(workspaceId: string, dateId: string) {
  const params = new URLSearchParams({ workspaceId });
  await request<{ ok: boolean }>(`/api/dates/${dateId}?${params.toString()}`, {
    method: 'DELETE',
  });
}

export function listDateGuestListEntries(workspaceId: string, dateId: string) {
  const params = new URLSearchParams({ workspaceId });
  return request<ScopedGuestListEntry[]>(`/api/dates/${dateId}/guest-list?${params.toString()}`);
}

export function addDateGuestListEntries(workspaceId: string, dateId: string, names: string[]) {
  const params = new URLSearchParams({ workspaceId });
  return request<ScopedGuestListEntry[]>(`/api/dates/${dateId}/guest-list?${params.toString()}`, {
    method: 'POST',
    body: JSON.stringify({ names }),
  });
}

export function updateDateGuestListEntry(workspaceId: string, entryId: string, name: string) {
  const params = new URLSearchParams({ workspaceId });
  return request<ScopedGuestListEntry>(`/api/dates/guest-list/${entryId}?${params.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteDateGuestListEntry(workspaceId: string, entryId: string) {
  const params = new URLSearchParams({ workspaceId });
  await request<{ ok: boolean }>(`/api/dates/guest-list/${entryId}?${params.toString()}`, {
    method: 'DELETE',
  });
}

export async function exportDateGuestListCsv(workspaceId: string, dateId: string) {
  const params = new URLSearchParams({ workspaceId });
  const response = await fetch(`/api/dates/${dateId}/guest-list/export?${params.toString()}`, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error('Unable to export guest list.');
  }
  return response.text();
}

export async function runDateAiIntake(input: FormData | { text?: string; workspaceId: string; projectId: string; tourId?: string | null; previewOnly?: boolean }) {
  const isFormData = input instanceof FormData;
  return request<IntakeResult | { intake: IntakeResult; createdDates: DateRecord[] }>('/api/dates/ai-intake', {
    method: 'POST',
    body: isFormData ? input : JSON.stringify(input),
  });
}
