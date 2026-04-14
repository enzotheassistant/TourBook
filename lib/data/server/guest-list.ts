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

export async function listGuestListEntriesScoped(userId: string, workspaceId: string, dateId: string): Promise<ScopedGuestListEntry[]> {
  await getDateScoped(userId, workspaceId, dateId);
  const supabase = getPrivilegedDataClient();
  const { data, error } = await supabase
    .from('guest_list_entries')
    .select('id, workspace_id, project_id, date_id, name, created_at')
    .eq('workspace_id', workspaceId)
    .eq('date_id', dateId)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new ApiError(500, error.message);
  }

  return (data ?? []).map(normalizeGuestListEntry);
}

export async function addGuestListEntriesScoped(userId: string, workspaceId: string, dateId: string, names: string[]) {
  await requireWorkspaceAccess(userId, workspaceId);
  const dateRecord = await getDateScoped(userId, workspaceId, dateId);
  const cleanedNames = names.map((name) => name.trim()).filter(Boolean);

  if (!cleanedNames.length) {
    throw new ApiError(400, 'At least one guest name is required.');
  }

  const supabase = getPrivilegedDataClient();
  const payload = cleanedNames.map((name) => ({
    workspace_id: workspaceId,
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

async function getGuestListEntryScoped(userId: string, workspaceId: string, entryId: string) {
  await requireWorkspaceAccess(userId, workspaceId);
  const supabase = getPrivilegedDataClient();
  const { data, error } = await supabase
    .from('guest_list_entries')
    .select('id, workspace_id, project_id, date_id, name, created_at')
    .eq('id', entryId)
    .eq('workspace_id', workspaceId)
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

  await getDateScoped(userId, workspaceId, String(data.date_id));
  return normalizeGuestListEntry(data);
}

export async function updateGuestListEntryScoped(userId: string, workspaceId: string, entryId: string, name: string) {
  await requireWorkspaceAccess(userId, workspaceId);
  const existing = await getGuestListEntryScoped(userId, workspaceId, entryId);
  const nextName = name.trim();
  if (!nextName) {
    throw new ApiError(400, 'Guest name is required.');
  }

  const supabase = getPrivilegedDataClient();
  const { data, error } = await supabase
    .from('guest_list_entries')
    .update({ name: nextName })
    .eq('id', entryId)
    .eq('workspace_id', workspaceId)
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

export async function deleteGuestListEntryScoped(userId: string, workspaceId: string, entryId: string) {
  await requireWorkspaceAccess(userId, workspaceId);
  await getGuestListEntryScoped(userId, workspaceId, entryId);
  const supabase = getPrivilegedDataClient();
  const { error } = await supabase.from('guest_list_entries').delete().eq('id', entryId).eq('workspace_id', workspaceId);

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
