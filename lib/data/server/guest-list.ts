import type { SupabaseClient } from '@supabase/supabase-js';
import { GUEST_LIST_WRITE_ROLES } from '@/lib/data/server/authorization';
import { ApiError, isMissingRelationError, requireScopedDataClient, requireWorkspaceAccess } from '@/lib/data/server/shared';
import { getDateScoped } from '@/lib/data/server/dates';
import type { ScopedGuestListEntry } from '@/lib/types/date-record';
import type { WorkspaceRole } from '@/lib/types/tenant';

function normalizeGuestListEntry(row: any): ScopedGuestListEntry {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    project_id: String(row.project_id),
    date_id: String(row.date_id),
    name: String(row.name ?? ''),
    created_at: String(row.created_at ?? ''),
  };
}

async function requireGuestListWriteAccess(supabase: SupabaseClient, userId: string, workspaceId: string) {
  await requireWorkspaceAccess(supabase, userId, workspaceId, [...GUEST_LIST_WRITE_ROLES]);
}

async function resolveWorkspaceForDate(
  supabase: SupabaseClient,
  userId: string,
  dateId: string,
  allowedRoles?: readonly WorkspaceRole[],
) {
  const { data, error } = await supabase
    .from('dates')
    .select('workspace_id')
    .eq('id', dateId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Dates schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  if (!data?.workspace_id) {
    throw new ApiError(404, 'Date not found.');
  }

  const workspaceId = String(data.workspace_id);
  await requireWorkspaceAccess(supabase, userId, workspaceId, allowedRoles ? [...allowedRoles] : undefined);
  return workspaceId;
}

async function resolveWorkspaceForEntry(
  supabase: SupabaseClient,
  userId: string,
  entryId: string,
  allowedRoles?: readonly WorkspaceRole[],
) {
  const { data, error } = await supabase
    .from('guest_list_entries')
    .select('workspace_id')
    .eq('id', entryId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Guest list schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  if (!data?.workspace_id) {
    throw new ApiError(404, 'Guest list entry not found.');
  }

  const workspaceId = String(data.workspace_id);
  await requireWorkspaceAccess(supabase, userId, workspaceId, allowedRoles ? [...allowedRoles] : undefined);
  return workspaceId;
}

export async function listGuestListEntriesScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string | null | undefined,
  dateId: string,
): Promise<ScopedGuestListEntry[]> {
  const supabase = requireScopedDataClient(supabaseInput);
  const resolvedWorkspaceId = workspaceId?.trim() ? workspaceId : await resolveWorkspaceForDate(supabase, userId, dateId);
  await getDateScoped(supabase, userId, resolvedWorkspaceId, dateId);
  const { data, error } = await supabase
    .from('guest_list_entries')
    .select('id, workspace_id, project_id, date_id, name, created_at')
    .eq('workspace_id', resolvedWorkspaceId)
    .eq('date_id', dateId)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new ApiError(500, error.message);
  }

  return (data ?? []).map(normalizeGuestListEntry);
}

export async function addGuestListEntriesScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string | null | undefined,
  dateId: string,
  names: string[],
) {
  const supabase = requireScopedDataClient(supabaseInput);
  const resolvedWorkspaceId = workspaceId?.trim()
    ? workspaceId
    : await resolveWorkspaceForDate(supabase, userId, dateId, GUEST_LIST_WRITE_ROLES);
  await requireGuestListWriteAccess(supabase, userId, resolvedWorkspaceId);
  const dateRecord = await getDateScoped(supabase, userId, resolvedWorkspaceId, dateId);
  const cleanedNames = names.map((name) => name.trim()).filter(Boolean);

  if (!cleanedNames.length) {
    throw new ApiError(400, 'At least one guest name is required.');
  }

  const payload = cleanedNames.map((name) => ({
    workspace_id: resolvedWorkspaceId,
    project_id: dateRecord.project_id,
    date_id: dateId,
    name,
  }));

  const { data, error } = await supabase
    .from('guest_list_entries')
    .insert(payload)
    .select('id, workspace_id, project_id, date_id, name, created_at');

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Guest list schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  return (data ?? []).map(normalizeGuestListEntry);
}

async function getGuestListEntryScoped(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string | null | undefined,
  entryId: string,
) {
  const resolvedWorkspaceId = workspaceId?.trim() ? workspaceId : await resolveWorkspaceForEntry(supabase, userId, entryId);
  await requireWorkspaceAccess(supabase, userId, resolvedWorkspaceId);
  const { data, error } = await supabase
    .from('guest_list_entries')
    .select('id, workspace_id, project_id, date_id, name, created_at')
    .eq('id', entryId)
    .eq('workspace_id', resolvedWorkspaceId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Guest list schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  if (!data) {
    throw new ApiError(404, 'Guest list entry not found.');
  }

  await getDateScoped(supabase, userId, resolvedWorkspaceId, String(data.date_id));
  return normalizeGuestListEntry(data);
}

export async function updateGuestListEntryScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string | null | undefined,
  entryId: string,
  name: string,
) {
  const supabase = requireScopedDataClient(supabaseInput);
  const resolvedWorkspaceId = workspaceId?.trim()
    ? workspaceId
    : await resolveWorkspaceForEntry(supabase, userId, entryId, GUEST_LIST_WRITE_ROLES);
  await requireGuestListWriteAccess(supabase, userId, resolvedWorkspaceId);
  await getGuestListEntryScoped(supabase, userId, resolvedWorkspaceId, entryId);
  const nextName = name.trim();
  if (!nextName) {
    throw new ApiError(400, 'Guest name is required.');
  }

  const { data, error } = await supabase
    .from('guest_list_entries')
    .update({ name: nextName })
    .eq('id', entryId)
    .eq('workspace_id', resolvedWorkspaceId)
    .select('id, workspace_id, project_id, date_id, name, created_at')
    .single();

  if (error || !data) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Guest list schema is not ready yet.');
    }
    throw new ApiError(500, error?.message ?? 'Unable to update guest list entry.');
  }

  return normalizeGuestListEntry(data);
}

export async function deleteGuestListEntryScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string | null | undefined,
  entryId: string,
) {
  const supabase = requireScopedDataClient(supabaseInput);
  const resolvedWorkspaceId = workspaceId?.trim()
    ? workspaceId
    : await resolveWorkspaceForEntry(supabase, userId, entryId, GUEST_LIST_WRITE_ROLES);
  await requireGuestListWriteAccess(supabase, userId, resolvedWorkspaceId);
  await getGuestListEntryScoped(supabase, userId, resolvedWorkspaceId, entryId);
  const { error } = await supabase.from('guest_list_entries').delete().eq('id', entryId).eq('workspace_id', resolvedWorkspaceId);

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Guest list schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }
}

export async function exportGuestListCsvScoped(supabaseInput: SupabaseClient, userId: string, workspaceId: string, dateId: string) {
  const entries = await listGuestListEntriesScoped(supabaseInput, userId, workspaceId, dateId);
  const lines = ['Name'];
  for (const entry of entries) {
    const escaped = entry.name.replaceAll('"', '""');
    lines.push(`"${escaped}"`);
  }
  return lines.join('\n');
}
