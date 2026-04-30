'use client';

import { mapDateRecordToShow, mapScopedGuestListEntryToLegacy, mapShowFormToDateForm } from '@/lib/adapters/date-show';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { GuestListEntry, Show, ShowFormValues } from '@/lib/types';
import { readCachedGuestList, readCachedItinerary, readCachedShow, writeCachedGuestList, writeCachedItinerary, writeCachedShow } from '@/lib/offline-cache';
import type { ProjectSummary, WorkspaceInviteRole, WorkspaceInviteSummary, WorkspaceMemberDirectoryEntry, WorkspaceSummary } from '@/lib/types/tenant';

type ScopeInput = {
  workspaceId?: string | null;
  projectId?: string | null;
  tourId?: string | null;
};

const WORKSPACE_STORAGE_KEY = 'tourbook.activeWorkspaceId';
const PROJECT_STORAGE_KEY = 'tourbook.activeProjectId';
const TOUR_STORAGE_KEY = 'tourbook.activeTourId';

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const supabase = getBrowserSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
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
  const rawTourId = (scope && 'tourId' in scope) ? scope.tourId : readStoredValue(TOUR_STORAGE_KEY);
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

export function peekCachedShows(includeDrafts = false, scope?: ScopeInput) {
  const resolved = requireWorkspaceProjectScope(scope);
  return readCachedItinerary({ ...resolved, includeDrafts });
}

export function peekCachedShow(id: string, scope?: ScopeInput) {
  const workspaceId = requireWorkspaceId(scope);
  return readCachedShow({ workspaceId, showId: id });
}

export function peekCachedGuestList(showId: string, scope?: ScopeInput) {
  const workspaceId = requireWorkspaceId(scope);
  return readCachedGuestList({ workspaceId, showId });
}

export async function listShows(includeDrafts = false, scope?: ScopeInput) {
  const resolved = requireWorkspaceProjectScope(scope);
  const params = new URLSearchParams({
    workspaceId: resolved.workspaceId,
    projectId: resolved.projectId,
  });
  if (resolved.tourId) params.set('tourId', resolved.tourId);
  if (includeDrafts) params.set('includeDrafts', '1');

  try {
    const dates = await request<any[]>(`/api/dates?${params.toString()}`);
    const shows = dates.map(mapDateRecordToShow);
    writeCachedItinerary({ ...resolved, includeDrafts }, shows);
    for (const show of shows) {
      writeCachedShow({ workspaceId: resolved.workspaceId, showId: show.id }, show);
    }
    return { shows, source: 'live' as const, savedAt: new Date().toISOString() };
  } catch (error) {
    const cached = readCachedItinerary({ ...resolved, includeDrafts });
    if (cached) {
      return { shows: cached.data, source: 'cache' as const, savedAt: cached.savedAt };
    }
    throw error;
  }
}

export async function getShow(id: string, scope?: ScopeInput) {
  const workspaceId = requireWorkspaceId(scope);
  const params = new URLSearchParams({ workspaceId });

  try {
    const date = await request<any>(`/api/dates/${id}?${params.toString()}`);
    const show = mapDateRecordToShow(date);
    writeCachedShow({ workspaceId, showId: id }, show);
    return { show, source: 'live' as const, savedAt: new Date().toISOString() };
  } catch (error) {
    const cached = readCachedShow({ workspaceId, showId: id });
    if (cached) {
      return { show: cached.data, source: 'cache' as const, savedAt: cached.savedAt };
    }
    throw error;
  }
}

export async function upsertShow(values: ShowFormValues, scope?: ScopeInput) {
  const resolved = requireWorkspaceProjectScope(scope);
  const payload = mapShowFormToDateForm(values, resolved);

  console.log(
    `[schedule/payload] upsertShow: sending ${(payload.schedule_items ?? []).length} schedule_items in payload`,
    (payload.schedule_items ?? []).map((item) => `"${item.label}" @ "${item.time_text}"`),
  );

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
  const resolved = resolveScope(scope);
  const params = new URLSearchParams();
  if (resolved.workspaceId) params.set('workspaceId', resolved.workspaceId);

  try {
    const entries = await request<any[]>(`/api/dates/${showId}/guest-list?${params.toString()}`);
    const mappedEntries = entries.map(mapScopedGuestListEntryToLegacy);
    if (resolved.workspaceId) {
      writeCachedGuestList({ workspaceId: resolved.workspaceId, showId }, mappedEntries);
    }
    return mappedEntries;
  } catch (error) {
    if (resolved.workspaceId) {
      const cached = readCachedGuestList({ workspaceId: resolved.workspaceId, showId });
      if (cached) return cached.data;
    }
    throw error;
  }
}

export async function addGuestListEntries(showId: string, names: string[], scope?: ScopeInput) {
  const resolved = resolveScope(scope);
  const params = new URLSearchParams();
  if (resolved.workspaceId) params.set('workspaceId', resolved.workspaceId);
  const entries = await request<any[]>(`/api/dates/${showId}/guest-list?${params.toString()}`, {
    method: 'POST',
    body: JSON.stringify({ names }),
  });
  const mappedEntries = entries.map(mapScopedGuestListEntryToLegacy);
  if (resolved.workspaceId) {
    const currentEntries = readCachedGuestList({ workspaceId: resolved.workspaceId, showId })?.data ?? [];
    writeCachedGuestList({ workspaceId: resolved.workspaceId, showId }, [...currentEntries, ...mappedEntries]);
  }
  return mappedEntries;
}

export async function updateGuestListEntry(entryId: string, name: string, scope?: ScopeInput) {
  const resolved = resolveScope(scope);
  const params = new URLSearchParams();
  if (resolved.workspaceId) params.set('workspaceId', resolved.workspaceId);
  const entry = await request<any>(`/api/dates/guest-list/${entryId}?${params.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  const mappedEntry = mapScopedGuestListEntryToLegacy(entry);
  if (resolved.workspaceId) {
    const currentEntries = readCachedGuestList({ workspaceId: resolved.workspaceId, showId: mappedEntry.show_id })?.data ?? [];
    writeCachedGuestList({ workspaceId: resolved.workspaceId, showId: mappedEntry.show_id }, currentEntries.map((currentEntry) => (currentEntry.id === entryId ? mappedEntry : currentEntry)));
  }
  return mappedEntry;
}

export async function deleteGuestListEntry(entryId: string, scope?: ScopeInput & { showId?: string | null }) {
  const resolved = resolveScope(scope);
  const params = new URLSearchParams();
  if (resolved.workspaceId) params.set('workspaceId', resolved.workspaceId);
  await request<{ ok: boolean }>(`/api/dates/guest-list/${entryId}?${params.toString()}`, {
    method: 'DELETE',
  });
  if (resolved.workspaceId && scope?.showId) {
    const currentEntries = readCachedGuestList({ workspaceId: resolved.workspaceId, showId: scope.showId })?.data ?? [];
    writeCachedGuestList({ workspaceId: resolved.workspaceId, showId: scope.showId }, currentEntries.filter((entry) => entry.id !== entryId));
  }
}

export async function exportGuestListCsv(showId: string, scope?: ScopeInput) {
  const resolved = resolveScope(scope);
  const params = new URLSearchParams();
  if (resolved.workspaceId) params.set('workspaceId', resolved.workspaceId);
  const supabase = getBrowserSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`/api/dates/${showId}/guest-list/export?${params.toString()}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error('Unable to export guest list');
  }

  return response.text();
}

export async function createWorkspace(input: { name: string; slug?: string | null }) {
  return request<WorkspaceSummary>('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      slug: input.slug ?? null,
    }),
  });
}

export async function createArtist(input: { workspaceId: string; name: string; slug?: string | null }) {
  return request<ProjectSummary>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      name: input.name,
      slug: input.slug ?? null,
    }),
  });
}

export async function renameArtist(input: { workspaceId: string; projectId: string; name: string }) {
  return request<ProjectSummary>(`/api/projects/${encodeURIComponent(input.projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      name: input.name,
    }),
  });
}

export async function deleteArtist(input: { workspaceId: string; projectId: string }) {
  return request<{ ok: boolean }>(`/api/projects/${encodeURIComponent(input.projectId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ workspaceId: input.workspaceId }),
  });
}

export async function listWorkspaceInvites(workspaceId: string) {
  const payload = await request<{ invites: WorkspaceInviteSummary[] }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites`);
  return payload.invites ?? [];
}

export async function createWorkspaceInvite(input: { workspaceId: string; name?: string | null; email: string; role: WorkspaceInviteRole; scopeType: 'workspace' | 'projects' | 'tours'; projectIds?: string[]; tourIds?: string[] }) {
  return request<{ invite: WorkspaceInviteSummary; acceptToken: string; emailDelivery?: { attempted?: boolean } }>(`/api/workspaces/${encodeURIComponent(input.workspaceId)}/invites`, {
    method: 'POST',
    body: JSON.stringify({ name: input.name ?? null, email: input.email, role: input.role, scopeType: input.scopeType, projectIds: input.projectIds ?? [], tourIds: input.tourIds ?? [] }),
  });
}

export async function revokeWorkspaceInvite(input: { workspaceId: string; inviteId: string }) {
  const payload = await request<{ invite: WorkspaceInviteSummary }>(`/api/workspaces/${encodeURIComponent(input.workspaceId)}/invites/${encodeURIComponent(input.inviteId)}`, {
    method: 'DELETE',
  });
  return payload.invite;
}

export async function acceptWorkspaceInvite(token: string) {
  return request<{ invite: WorkspaceInviteSummary; membershipCreated: boolean }>('/api/workspaces/invites/accept', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function listWorkspaceMembers(workspaceId: string) {
  const payload = await request<{ members: WorkspaceMemberDirectoryEntry[] }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`);
  return payload.members ?? [];
}

export async function updateWorkspaceMember(input: { workspaceId: string; memberId: string; role: 'admin' | 'editor' | 'viewer'; scopeType: 'workspace' | 'projects' | 'tours'; projectIds?: string[]; tourIds?: string[] }) {
  const payload = await request<{ member: WorkspaceMemberDirectoryEntry }>(`/api/workspaces/${encodeURIComponent(input.workspaceId)}/members/${encodeURIComponent(input.memberId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      role: input.role,
      scopeType: input.scopeType,
      projectIds: input.projectIds ?? [],
      tourIds: input.tourIds ?? [],
    }),
  });
  return payload.member;
}

export async function removeWorkspaceMember(input: { workspaceId: string; memberId: string }) {
  return request<{ ok: boolean }>(`/api/workspaces/${encodeURIComponent(input.workspaceId)}/members/${encodeURIComponent(input.memberId)}`, {
    method: 'DELETE',
  });
}
