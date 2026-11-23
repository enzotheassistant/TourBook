'use client';

import { mapDateRecordToShow, mapScopedGuestListEntryToLegacy, mapShowFormToDateForm } from '@/lib/adapters/date-show';
import { prepareAttachmentUpload, THUMBNAIL_CONTENT_TYPE } from '@/lib/attachments/prepare-upload';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { GuestListEntry, Show, ShowFormValues } from '@/lib/types';
import type { DateAttachment } from '@/lib/types/date-record';
import { readCachedGuestList, readCachedItinerary, readCachedShow, writeCachedGuestList, writeCachedItinerary, writeCachedShow } from '@/lib/offline-cache';
import type { ProjectSummary, TourSummary, WorkspaceInviteRole, WorkspaceInviteSummary, WorkspaceMemberDirectoryEntry, WorkspaceSummary } from '@/lib/types/tenant';

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
    throw new Error('No active workspace or project selected.');
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

export async function listAttachments(dateId: string, scope?: ScopeInput) {
  const resolved = resolveScope(scope);
  const params = new URLSearchParams();
  if (resolved.workspaceId) params.set('workspaceId', resolved.workspaceId);
  return request<DateAttachment[]>(`/api/dates/${dateId}/attachments?${params.toString()}`);
}

type AttachmentUploadTicket = {
  bucket: string;
  attachmentId: string;
  path: string;
  token: string;
  thumbnailPath: string | null;
  thumbnailToken: string | null;
};

/**
 * Uploads go straight from the browser to Supabase Storage rather than through
 * our own API route, because Vercel caps request bodies at ~4.5 MB — far below
 * the 25 MB attachment limit. Three steps:
 *   1. ask our API for a one-time signed upload slot (it checks permissions,
 *      file type and size, and picks the storage path),
 *   2. upload the file (and its thumbnail) directly to that slot,
 *   3. tell our API the upload finished; it confirms the file really landed
 *      in Storage before recording it.
 */
export async function uploadAttachment(dateId: string, file: File, scope?: ScopeInput, displayName?: string | null) {
  const resolved = resolveScope(scope);
  const params = new URLSearchParams();
  if (resolved.workspaceId) params.set('workspaceId', resolved.workspaceId);

  const prepared = await prepareAttachmentUpload(file);
  const fileSize = prepared.file.size;

  const ticket = await request<AttachmentUploadTicket>(`/api/dates/${dateId}/attachments/upload-url?${params.toString()}`, {
    method: 'POST',
    body: JSON.stringify({
      fileName: prepared.fileName,
      contentType: prepared.contentType,
      fileSize,
      withThumbnail: Boolean(prepared.thumbnail),
    }),
  });

  const bucket = getBrowserSupabaseClient().storage.from(ticket.bucket);
  const { error: uploadError } = await bucket.uploadToSignedUrl(ticket.path, ticket.token, prepared.file, {
    contentType: prepared.contentType,
  });
  if (uploadError) {
    throw new Error(`Unable to upload "${file.name}". Check your connection and try again.`);
  }

  let thumbnailUploaded = false;
  if (prepared.thumbnail && ticket.thumbnailPath && ticket.thumbnailToken) {
    const { error: thumbnailError } = await bucket.uploadToSignedUrl(ticket.thumbnailPath, ticket.thumbnailToken, prepared.thumbnail, {
      contentType: THUMBNAIL_CONTENT_TYPE,
    });
    // Non-fatal: without a thumbnail the file just shows as a generic file tile.
    thumbnailUploaded = !thumbnailError;
  }

  return request<DateAttachment>(`/api/dates/${dateId}/attachments?${params.toString()}`, {
    method: 'POST',
    body: JSON.stringify({
      attachmentId: ticket.attachmentId,
      fileName: prepared.fileName,
      contentType: prepared.contentType,
      fileSize,
      thumbnailUploaded,
      displayName: displayName?.trim() || null,
    }),
  });
}

/** Sets an attachment's custom display name; an empty name goes back to the file name. */
export async function renameAttachment(attachmentId: string, displayName: string, scope?: ScopeInput) {
  const resolved = resolveScope(scope);
  const params = new URLSearchParams();
  if (resolved.workspaceId) params.set('workspaceId', resolved.workspaceId);
  return request<DateAttachment>(`/api/dates/attachments/${attachmentId}?${params.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
}

export async function deleteAttachment(attachmentId: string, scope?: ScopeInput) {
  const resolved = resolveScope(scope);
  const params = new URLSearchParams();
  if (resolved.workspaceId) params.set('workspaceId', resolved.workspaceId);
  await request<{ ok: boolean }>(`/api/dates/attachments/${attachmentId}?${params.toString()}`, {
    method: 'DELETE',
  });
}

/** Short-lived link for showing a file inside the app (no download prompt). */
export async function getAttachmentViewUrl(attachmentId: string, scope?: ScopeInput) {
  const resolved = resolveScope(scope);
  const params = new URLSearchParams();
  if (resolved.workspaceId) params.set('workspaceId', resolved.workspaceId);
  params.set('mode', 'view');
  return request<{ url: string; fileName: string; contentType: string }>(`/api/dates/attachments/${attachmentId}/download?${params.toString()}`);
}

export function getAttachmentDownloadHref(attachmentId: string, scope?: ScopeInput, variant: 'original' | 'thumbnail' = 'original') {
  const resolved = resolveScope(scope);
  const params = new URLSearchParams();
  if (resolved.workspaceId) params.set('workspaceId', resolved.workspaceId);
  if (variant === 'thumbnail') params.set('variant', 'thumbnail');
  return `/api/dates/attachments/${attachmentId}/download?${params.toString()}`;
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

/** Rename a workspace (owner only). */
export async function renameWorkspace(input: { workspaceId: string; name: string }) {
  const payload = await request<{ workspace: WorkspaceSummary }>(`/api/workspaces/${encodeURIComponent(input.workspaceId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: input.name }),
  });
  return payload.workspace;
}

/** Delete a workspace you own and everything in it. */
export async function deleteWorkspace(input: { workspaceId: string; confirmName: string; password: string }) {
  return request<{ deleted: { id: string; name: string } }>(`/api/workspaces/${encodeURIComponent(input.workspaceId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirmName: input.confirmName, password: input.password }),
  });
}

/** Delete your own account. */
export async function deleteMyAccount(input: { password: string; confirm: string }) {
  return request<{ deleted: true }>('/api/account', {
    method: 'DELETE',
    body: JSON.stringify({ password: input.password, confirm: input.confirm }),
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

/** Per-band access sent to the server: one level per band (tourIds empty = whole band), or all projects. */
export type AccessPayload =
  | { allProjects: true; role: 'viewer' | 'crew' | 'editor' }
  | { allProjects: false; entries: Array<{ projectId: string; role: string; tourIds: string[] }> };

export async function createWorkspaceInvite(input: { workspaceId: string; name?: string | null; email: string; access?: AccessPayload; role?: WorkspaceInviteRole; scopeType?: 'workspace' | 'projects' | 'tours'; projectIds?: string[]; tourIds?: string[] }) {
  return request<{ invite: WorkspaceInviteSummary; acceptToken: string; emailDelivery?: { attempted?: boolean } }>(`/api/workspaces/${encodeURIComponent(input.workspaceId)}/invites`, {
    method: 'POST',
    body: JSON.stringify(input.access
      ? { name: input.name ?? null, email: input.email, access: input.access }
      : { name: input.name ?? null, email: input.email, role: input.role, scopeType: input.scopeType, projectIds: input.projectIds ?? [], tourIds: input.tourIds ?? [] }),
  });
}

export async function resendWorkspaceInvite(input: { workspaceId: string; inviteId: string }) {
  return request<{ invite: WorkspaceInviteSummary; acceptToken: string; emailDelivery?: { attempted?: boolean } }>(
    `/api/workspaces/${encodeURIComponent(input.workspaceId)}/invites/${encodeURIComponent(input.inviteId)}/resend`,
    { method: 'POST' },
  );
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

/**
 * Change someone's access. Send `access` (per band). The result has
 * `removed: true` when they no longer have any band left (off the team).
 */
export async function updateWorkspaceMember(input: { workspaceId: string; memberId: string; access: AccessPayload | null }) {
  const payload = await request<{ member: WorkspaceMemberDirectoryEntry & { removed?: boolean } }>(`/api/workspaces/${encodeURIComponent(input.workspaceId)}/members/${encodeURIComponent(input.memberId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ access: input.access ?? { allProjects: false, entries: [] } }),
  });
  return payload.member;
}

export async function removeWorkspaceMember(input: { workspaceId: string; memberId: string }) {
  return request<{ ok: boolean }>(`/api/workspaces/${encodeURIComponent(input.workspaceId)}/members/${encodeURIComponent(input.memberId)}`, {
    method: 'DELETE',
  });
}

export type TourWithUsage = TourSummary & { dateCount: number; lastDate: string | null };

/** Tours for one project, with how many dates use each (for Settings → Projects). */
export async function listProjectTours(input: { workspaceId: string; projectId: string }) {
  const params = new URLSearchParams({ workspaceId: input.workspaceId, projectId: input.projectId });
  return request<TourWithUsage[]>(`/api/tours?${params.toString()}`);
}

/** Archive (hide from the Tour dropdown) or restore a tour. Dates keep their tour name. */
export async function setTourArchived(input: { workspaceId: string; tourId: string; archived: boolean }) {
  const payload = await request<{ tour: TourSummary }>(`/api/tours/${encodeURIComponent(input.tourId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ workspaceId: input.workspaceId, archived: input.archived }),
  });
  return payload.tour;
}

/** Delete a tour that has no dates (typos, test tours). */
export async function deleteTour(input: { workspaceId: string; tourId: string }) {
  const params = new URLSearchParams({ workspaceId: input.workspaceId });
  return request<{ ok: boolean }>(`/api/tours/${encodeURIComponent(input.tourId)}?${params.toString()}`, { method: 'DELETE' });
}

/**
 * Change a waiting invite's access. With sendEmail (default), they get an
 * "invite updated" email with a fresh link; the old link stops working.
 */
export async function updateWorkspaceInviteAccess(input: { workspaceId: string; inviteId: string; access: AccessPayload; sendEmail: boolean }) {
  return request<{ invite: WorkspaceInviteSummary; acceptToken: string | null }>(
    `/api/workspaces/${encodeURIComponent(input.workspaceId)}/invites/${encodeURIComponent(input.inviteId)}`,
    { method: 'PATCH', body: JSON.stringify({ access: input.access, sendEmail: input.sendEmail }) },
  );
}
