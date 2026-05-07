import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, ensureProjectInWorkspace, ensureTourInScope, getPrivilegedDataClient, isMissingRelationError, requireScopedDataClient, requireWorkspaceAccess } from '@/lib/data/server/shared';
import { MemberUpdateValidationError, validateWorkspaceMemberUpdatePayload } from '@/lib/data/server/member-update-utils';
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

function deriveDisplayName(user: any) {
  const meta = user?.user_metadata ?? user?.raw_user_meta_data ?? {};
  const fullName = String(meta.full_name ?? meta.name ?? meta.display_name ?? '').trim();
  if (fullName) return fullName;
  const first = String(meta.first_name ?? '').trim();
  const last = String(meta.last_name ?? '').trim();
  const combined = [first, last].filter(Boolean).join(' ').trim();
  return combined || null;
}

async function getUserDirectoryInfoByUserId(userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueUserIds.length) return new Map<string, { email: string | null; name: string | null }>();

  try {
    const supabase = getPrivilegedDataClient();
    const entries = await Promise.all(uniqueUserIds.map(async (userId) => {
      try {
        const response = await supabase.auth.admin.getUserById(userId);
        return [userId, { email: response.data.user?.email ?? null, name: deriveDisplayName(response.data.user) }] as const;
      } catch {
        return [userId, { email: null, name: null }] as const;
      }
    }));
    return new Map(entries);
  } catch {
    return new Map(uniqueUserIds.map((userId) => [userId, { email: null, name: null }]));
  }
}

async function replaceMemberProjectGrants(
  supabase: SupabaseClient,
  workspaceId: string,
  memberId: string,
  projectIds: string[],
) {
  const { error: deleteError } = await supabase
    .from('workspace_member_projects')
    .delete()
    .eq('workspace_member_id', memberId);

  if (deleteError) {
    if (isMissingRelationError(deleteError)) throw new ApiError(409, 'Workspace membership scope schema is not ready yet.');
    throw new ApiError(500, deleteError.message);
  }

  if (!projectIds.length) return;

  const { error: insertError } = await supabase
    .from('workspace_member_projects')
    .insert(projectIds.map((projectId) => ({
      workspace_member_id: memberId,
      workspace_id: workspaceId,
      project_id: projectId,
    })));

  if (insertError) {
    if (isMissingRelationError(insertError)) throw new ApiError(409, 'Workspace membership scope schema is not ready yet.');
    throw new ApiError(500, insertError.message);
  }
}

async function replaceMemberTourGrants(
  supabase: SupabaseClient,
  workspaceId: string,
  memberId: string,
  tours: Array<{ projectId: string; tourId: string }>,
) {
  const { error: deleteError } = await supabase
    .from('workspace_member_tours')
    .delete()
    .eq('workspace_member_id', memberId);

  if (deleteError) {
    if (isMissingRelationError(deleteError)) throw new ApiError(409, 'Workspace tour scope schema is not ready yet.');
    throw new ApiError(500, deleteError.message);
  }

  if (!tours.length) return;

  const { error: insertError } = await supabase
    .from('workspace_member_tours')
    .insert(tours.map(({ projectId, tourId }) => ({
      workspace_member_id: memberId,
      workspace_id: workspaceId,
      project_id: projectId,
      tour_id: tourId,
    })));

  if (insertError) {
    if (isMissingRelationError(insertError)) throw new ApiError(409, 'Workspace tour scope schema is not ready yet.');
    throw new ApiError(500, insertError.message);
  }
}

async function readWorkspaceMemberById(supabase: SupabaseClient, workspaceId: string, memberId: string) {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('id, workspace_id, user_id, role, scope_type, created_at')
    .eq('workspace_id', workspaceId)
    .eq('id', memberId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) throw new ApiError(409, 'Workspace membership schema is not ready yet.');
    throw new ApiError(500, error.message);
  }

  if (!data) throw new ApiError(404, 'Member not found.');
  return data;
}

export async function listWorkspaceMembersScoped(supabaseInput: SupabaseClient, userId: string, workspaceId: string) {
  const authSupabase = requireScopedDataClient(supabaseInput);
  await requireWorkspaceAccess(authSupabase, userId, workspaceId, ['owner', 'admin']);

  const supabase = getPrivilegedDataClient();
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
  const [projectMap, tourMap, directoryInfoByUserId] = await Promise.all([
    getMemberProjectIds(supabase, memberIds),
    getMemberTourIds(supabase, memberIds),
    getUserDirectoryInfoByUserId(userIds),
  ]);

  return rows.map((row: any) => {
    const memberId = String(row.id);
    const scopeType = normalizeScopeType(row.scope_type);
    const projectIds = [...new Set(projectMap.get(memberId) ?? [])];
    const tourIds = [...new Set(tourMap.get(memberId) ?? [])];
    const directoryInfo = directoryInfoByUserId.get(String(row.user_id)) ?? { email: null, name: null };
    return {
      id: memberId,
      workspaceId: String(row.workspace_id),
      userId: String(row.user_id),
      name: directoryInfo.name,
      email: directoryInfo.email,
      role: String(row.role) as WorkspaceRole,
      scopeType,
      projectIds: scopeType === 'workspace' ? [] : projectIds,
      tourIds: scopeType === 'tours' ? tourIds : [],
      createdAt: row.created_at ? String(row.created_at) : null,
    } satisfies WorkspaceMemberDirectoryEntry;
  });
}

export async function updateWorkspaceMemberScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { workspaceId: string; memberId: string; role?: unknown; scopeType?: unknown; projectIds?: unknown; tourIds?: unknown },
) {
  const authSupabase = requireScopedDataClient(supabaseInput);
  const supabase = getPrivilegedDataClient();
  const workspaceId = String(input.workspaceId ?? '').trim();
  const memberId = String(input.memberId ?? '').trim();
  if (!workspaceId) throw new ApiError(400, 'workspaceId is required.');
  if (!memberId) throw new ApiError(400, 'memberId is required.');

  const actor = await requireWorkspaceAccess(authSupabase, userId, workspaceId, ['owner', 'admin']);
  const existing = await readWorkspaceMemberById(supabase, workspaceId, memberId);
  const targetRole = String(existing.role) as WorkspaceRole;
  const targetUserId = String(existing.user_id);

  if (targetUserId === userId) {
    throw new ApiError(409, 'Use a dedicated account flow instead of editing your own membership here.');
  }
  if (targetRole === 'owner') {
    throw new ApiError(409, 'Workspace owner cannot be edited from Team.');
  }
  if (actor.role !== 'owner' && targetRole === 'admin') {
    throw new ApiError(403, 'Only the workspace owner can edit another admin.');
  }

  let payload;
  try {
    payload = validateWorkspaceMemberUpdatePayload(input);
  } catch (error) {
    if (error instanceof MemberUpdateValidationError) {
      throw new ApiError(error.status, error.message);
    }
    throw error;
  }
  if (payload.role === 'owner') {
    throw new ApiError(400, 'Use workspace ownership transfer instead of assigning owner here.');
  }
  if (actor.role !== 'owner' && payload.role === 'admin') {
    throw new ApiError(403, 'Only the workspace owner can assign admin access.');
  }

  const validatedProjectIds = payload.scopeType === 'projects'
    ? await Promise.all(payload.projectIds.map(async (projectId) => {
        await ensureProjectInWorkspace(supabase, workspaceId, projectId);
        return projectId;
      }))
    : [];

  const validatedTours = payload.scopeType === 'tours'
    ? await Promise.all(payload.tourIds.map(async (tourId) => {
        const { data: tour, error } = await supabase
          .from('tours')
          .select('id, project_id')
          .eq('workspace_id', workspaceId)
          .eq('id', tourId)
          .maybeSingle();

        if (error) {
          if (isMissingRelationError(error)) throw new ApiError(409, 'Workspace tour scope schema is not ready yet.');
          throw new ApiError(500, error.message);
        }
        if (!tour) throw new ApiError(404, 'Tour not found in this workspace.');
        const projectId = String(tour.project_id);
        await ensureProjectInWorkspace(supabase, workspaceId, projectId);
        await ensureTourInScope(supabase, workspaceId, projectId, String(tour.id));
        return { projectId, tourId: String(tour.id) };
      }))
    : [];

  const nextProjectIds = payload.scopeType === 'tours'
    ? [...new Set(validatedTours.map((tour) => tour.projectId))]
    : validatedProjectIds;

  const { error: updateError } = await supabase
    .from('workspace_members')
    .update({
      role: payload.role,
      scope_type: payload.scopeType,
    })
    .eq('workspace_id', workspaceId)
    .eq('id', memberId);

  if (updateError) {
    if (isMissingRelationError(updateError)) throw new ApiError(409, 'Workspace membership schema is not ready yet.');
    throw new ApiError(500, updateError.message);
  }

  await replaceMemberProjectGrants(supabase, workspaceId, memberId, payload.scopeType === 'workspace' ? [] : nextProjectIds);
  await replaceMemberTourGrants(supabase, workspaceId, memberId, payload.scopeType === 'tours' ? validatedTours : []);

  const [projectMap, tourMap, emailsByUserId, updated] = await Promise.all([
    getMemberProjectIds(supabase, [memberId]),
    getMemberTourIds(supabase, [memberId]),
    getUserDirectoryInfoByUserId([targetUserId]),
    readWorkspaceMemberById(supabase, workspaceId, memberId),
  ]);

  const scopeType = normalizeScopeType(updated.scope_type);
  return {
    id: String(updated.id),
    workspaceId: String(updated.workspace_id),
    userId: targetUserId,
    email: emailsByUserId.get(targetUserId)?.email ?? null,
    name: emailsByUserId.get(targetUserId)?.name ?? null,
    role: String(updated.role) as WorkspaceRole,
    scopeType,
    projectIds: scopeType === 'workspace' ? [] : [...new Set(projectMap.get(memberId) ?? [])],
    tourIds: scopeType === 'tours' ? [...new Set(tourMap.get(memberId) ?? [])] : [],
    createdAt: updated.created_at ? String(updated.created_at) : null,
  } satisfies WorkspaceMemberDirectoryEntry;
}

export async function removeWorkspaceMemberScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { workspaceId: string; memberId: string },
) {
  const authSupabase = requireScopedDataClient(supabaseInput);
  const supabase = getPrivilegedDataClient();
  const workspaceId = String(input.workspaceId ?? '').trim();
  const memberId = String(input.memberId ?? '').trim();
  if (!workspaceId) throw new ApiError(400, 'workspaceId is required.');
  if (!memberId) throw new ApiError(400, 'memberId is required.');

  const actor = await requireWorkspaceAccess(authSupabase, userId, workspaceId, ['owner', 'admin']);
  const existing = await readWorkspaceMemberById(supabase, workspaceId, memberId);

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
