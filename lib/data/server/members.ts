import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, getPrivilegedDataClient, isMissingRelationError, requireScopedDataClient, requireWorkspaceAccess } from '@/lib/data/server/shared';
import type { WorkspaceMemberDirectoryEntry, WorkspaceRole, WorkspaceScopeType } from '@/lib/types/tenant';

function normalizeScopeType(value: unknown): WorkspaceScopeType {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || raw === 'workspace') return 'workspace';
  if (raw === 'projects') return 'projects';
  if (raw === 'tours') return 'tours';
  return 'workspace';
}

async function getMemberProjectIds(supabase: SupabaseClient, memberIds: string[]) {
  if (!memberIds.length) return new Map<string, string[]>();
  const { data, error } = await supabase
    .from('workspace_member_projects')
    .select('workspace_member_id, project_id')
    .in('workspace_member_id', memberIds);

  if (error) {
    if (isMissingRelationError(error)) return new Map<string, string[]>();
    throw new ApiError(500, error.message);
  }

  return (data ?? []).reduce((map: Map<string, string[]>, row: any) => {
    const memberId = String(row.workspace_member_id);
    const next = map.get(memberId) ?? [];
    next.push(String(row.project_id));
    map.set(memberId, next);
    return map;
  }, new Map<string, string[]>());
}

async function getMemberTourIds(supabase: SupabaseClient, memberIds: string[]) {
  if (!memberIds.length) return new Map<string, string[]>();
  const { data, error } = await supabase
    .from('workspace_member_tours')
    .select('workspace_member_id, project_id, tour_id')
    .in('workspace_member_id', memberIds);

  if (error) {
    if (isMissingRelationError(error)) return new Map<string, string[]>();
    throw new ApiError(500, error.message);
  }

  return (data ?? []).reduce((map: Map<string, string[]>, row: any) => {
    const memberId = String(row.workspace_member_id);
    const next = map.get(memberId) ?? [];
    next.push(String(row.tour_id));
    map.set(memberId, next);
    return map;
  }, new Map<string, string[]>());
}

async function getEmailsByUserId(userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueUserIds.length) return new Map<string, string | null>();

  try {
    const supabase = getPrivilegedDataClient();
    const entries = await Promise.all(uniqueUserIds.map(async (userId) => {
      try {
        const response = await supabase.auth.admin.getUserById(userId);
        return [userId, response.data.user?.email ?? null] as const;
      } catch {
        return [userId, null] as const;
      }
    }));
    return new Map(entries);
  } catch {
    return new Map(uniqueUserIds.map((userId) => [userId, null]));
  }
}

export async function listWorkspaceMembersScoped(supabaseInput: SupabaseClient, userId: string, workspaceId: string) {
  const supabase = requireScopedDataClient(supabaseInput);
  await requireWorkspaceAccess(supabase, userId, workspaceId, ['owner', 'admin']);

  const { data, error } = await supabase
    .from('workspace_members')
    .select('id, workspace_id, user_id, role, scope_type, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) return [] satisfies WorkspaceMemberDirectoryEntry[];
    throw new ApiError(500, error.message);
  }

  const rows = data ?? [];
  const memberIds = rows.map((row: any) => String(row.id));
  const userIds = rows.map((row: any) => String(row.user_id));
  const [projectMap, tourMap, emailsByUserId] = await Promise.all([
    getMemberProjectIds(supabase, memberIds),
    getMemberTourIds(supabase, memberIds),
    getEmailsByUserId(userIds),
  ]);

  return rows.map((row: any) => {
    const memberId = String(row.id);
    const scopeType = normalizeScopeType(row.scope_type);
    const projectIds = [...new Set(projectMap.get(memberId) ?? [])];
    const tourIds = [...new Set(tourMap.get(memberId) ?? [])];
    return {
      id: memberId,
      workspaceId: String(row.workspace_id),
      userId: String(row.user_id),
      email: emailsByUserId.get(String(row.user_id)) ?? null,
      role: String(row.role) as WorkspaceRole,
      scopeType,
      projectIds: scopeType === 'workspace' ? [] : projectIds,
      tourIds: scopeType === 'tours' ? tourIds : [],
      createdAt: row.created_at ? String(row.created_at) : null,
    } satisfies WorkspaceMemberDirectoryEntry;
  });
}

export async function removeWorkspaceMemberScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { workspaceId: string; memberId: string },
) {
  const supabase = requireScopedDataClient(supabaseInput);
  const workspaceId = String(input.workspaceId ?? '').trim();
  const memberId = String(input.memberId ?? '').trim();
  if (!workspaceId) throw new ApiError(400, 'workspaceId is required.');
  if (!memberId) throw new ApiError(400, 'memberId is required.');

  const actor = await requireWorkspaceAccess(supabase, userId, workspaceId, ['owner', 'admin']);
  const { data: existing, error } = await supabase
    .from('workspace_members')
    .select('id, user_id, role')
    .eq('workspace_id', workspaceId)
    .eq('id', memberId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) throw new ApiError(409, 'Workspace membership schema is not ready yet.');
    throw new ApiError(500, error.message);
  }
  if (!existing) throw new ApiError(404, 'Member not found.');

  const targetRole = String(existing.role) as WorkspaceRole;
  const targetUserId = String(existing.user_id);
  if (targetUserId === userId) {
    throw new ApiError(409, 'Use a separate leave-workspace flow instead of removing yourself here.');
  }
  if (targetRole === 'owner') {
    throw new ApiError(409, 'Workspace owner cannot be removed from Team.');
  }
  if (actor.role !== 'owner' && targetRole === 'admin') {
    throw new ApiError(403, 'Only the workspace owner can remove another admin.');
  }

  const { error: deleteError } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', memberId);

  if (deleteError) {
    if (isMissingRelationError(deleteError)) throw new ApiError(409, 'Workspace membership schema is not ready yet.');
    throw new ApiError(500, deleteError.message);
  }

  return { ok: true };
}
