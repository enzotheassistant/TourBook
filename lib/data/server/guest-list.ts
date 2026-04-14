import { ApiError, getPrivilegedDataClient, isMissingRelationError, requireWorkspaceAccess } from '@/lib/data/server/shared';
import { getDateScoped } from '@/lib/data/server/dates';
import type { ScopedGuestListEntry } from '@/lib/types/date-record';

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

async function resolveWorkspaceForDate(userId: string, dateId: string) {
  const supabase = getPrivilegedDataClient();
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
  await requireWorkspaceAccess(userId, workspaceId);
  return workspaceId;
}

async function resolveWorkspaceForEntry(userId: string, entryId: string) {
  const supabase = getPrivilegedDataClient();
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
  await requireWorkspaceAccess(userId, workspaceId);
  return workspaceId;
}

export async function listGuestListEntriesScoped(userId: string, workspaceId: string | null | undefined, dateId: string): Promise<ScopedGuestListEntry[]> {
  const resolvedWorkspaceId = workspaceId?.trim() ? workspaceId : await resolveWorkspaceForDate(userId, dateId);
  await getDateScoped(userId, resolvedWorkspaceId, dateId);
  const supabase = getPrivilegedDataClient();
  const { data, error } = await supabase
    .from('guest_list_entries')
    .select('id, workspace_id, project_id, date_id, name, created_at')
    .eq('workspace_id', resolvedWorkspaceId)
    .eq('date_id', dateId)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new ApiError(500, error.message);
  }

  return (data ?? []).map(normalizeGuestListEntry);
}

export async function addGuestListEntriesScoped(userId: string, workspaceId: string | null | undefined, dateId: string, names: string[]) {
  const resolvedWorkspaceId = workspaceId?.trim() ? workspaceId : await resolveWorkspaceForDate(userId, dateId);
  await requireWorkspaceAccess(userId, resolvedWorkspaceId);
  const dateRecord = await getDateScoped(userId, resolvedWorkspaceId, dateId);
  const cleanedNames = names.map((name) => name.trim()).filter(Boolean);

  if (!cleanedNames.length) {
    throw new ApiError(400, 'At least one guest name is required.');
  }

  const supabase = getPrivilegedDataClient();
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

async function getGuestListEntryScoped(userId: string, workspaceId: string | null | undefined, entryId: string) {
  const resolvedWorkspaceId = workspaceId?.trim() ? workspaceId : await resolveWorkspaceForEntry(userId, entryId);
  await requireWorkspaceAccess(userId, resolvedWorkspaceId);
  const supabase = getPrivilegedDataClient();
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

  await getDateScoped(userId, resolvedWorkspaceId, String(data.date_id));
  return normalizeGuestListEntry(data);
}

export async function updateGuestListEntryScoped(userId: string, workspaceId: string | null | undefined, entryId: string, name: string) {
  const resolvedWorkspaceId = workspaceId?.trim() ? workspaceId : await resolveWorkspaceForEntry(userId, entryId);
  await requireWorkspaceAccess(userId, resolvedWorkspaceId);
  await getGuestListEntryScoped(userId, resolvedWorkspaceId, entryId);
  const nextName = name.trim();
  if (!nextName) {
    throw new ApiError(400, 'Guest name is required.');
  }

  const supabase = getPrivilegedDataClient();
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

export async function deleteGuestListEntryScoped(userId: string, workspaceId: string | null | undefined, entryId: string) {
  const resolvedWorkspaceId = workspaceId?.trim() ? workspaceId : await resolveWorkspaceForEntry(userId, entryId);
  await requireWorkspaceAccess(userId, resolvedWorkspaceId);
  await getGuestListEntryScoped(userId, resolvedWorkspaceId, entryId);
  const supabase = getPrivilegedDataClient();
  const { error } = await supabase.from('guest_list_entries').delete().eq('id', entryId).eq('workspace_id', resolvedWorkspaceId);

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Guest list schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }
}

export async function exportGuestListCsvScoped(userId: string, workspaceId: string, dateId: string) {
  const entries = await listGuestListEntriesScoped(userId, workspaceId, dateId);
  const lines = ['Name'];
  for (const entry of entries) {
    const escaped = entry.name.replaceAll('"', '""');
    lines.push(`"${escaped}"`);
  }
  return lines.join('\n');
}
