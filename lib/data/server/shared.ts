import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server';
import type { WorkspaceRole } from '@/lib/types/tenant';
import { canAccessProjectByScope, canAccessTourByScope } from '@/lib/data/server/project-scope-utils';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type WorkspaceAccessScopeType = 'workspace' | 'projects' | 'tours';

export type WorkspaceAccess = {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  scopeType: WorkspaceAccessScopeType;
  projectIds: string[];
  tourIds: string[];
};

export function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeCode = 'code' in error ? String((error as { code?: string }).code ?? '') : '';
  const maybeMessage = 'message' in error ? String((error as { message?: string }).message ?? '') : '';
  return maybeCode === '42P01' || maybeMessage.toLowerCase().includes('does not exist');
}

export function isSchemaDriftError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeCode = 'code' in error ? String((error as { code?: string }).code ?? '') : '';
  const maybeMessage = 'message' in error ? String((error as { message?: string }).message ?? '') : '';
  const message = maybeMessage.toLowerCase();
  return isMissingRelationError(error) || maybeCode === '42703' || message.includes('column') || message.includes('schema cache');
}

/**
 * Explicit privileged client for system/background/admin tasks.
 * Do not use in normal user request paths.
 */
export function getPrivilegedDataClient() {
  return createServiceRoleSupabaseClient();
}

export function requireScopedDataClient(supabase: SupabaseClient | null | undefined) {
  if (!supabase) {
    throw new ApiError(500, 'Scoped Supabase client is required.');
  }
  return supabase;
}

function normalizeScopeType(value: unknown): WorkspaceAccessScopeType {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || raw === 'workspace') return 'workspace';
  if (raw === 'projects') return 'projects';
  if (raw === 'tours') return 'tours';
  throw new ApiError(403, 'Workspace membership scope is invalid.');
}

export async function requireWorkspaceAccess(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
  allowedRoles?: WorkspaceRole[],
): Promise<WorkspaceAccess> {
  if (!workspaceId) {
    throw new ApiError(400, 'workspaceId is required.');
  }

  const { data, error } = await supabase
    .from('workspace_members')
    .select('id, workspace_id, user_id, role, scope_type')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Workspace membership schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  if (!data) {
    throw new ApiError(403, 'You do not have access to this workspace.');
  }

  const role = String(data.role) as WorkspaceRole;
  if (allowedRoles && !allowedRoles.includes(role)) {
    throw new ApiError(403, 'You do not have permission to perform this action.');
  }

  const scopeType = normalizeScopeType(data.scope_type);
  let projectIds: string[] = [];
  let tourIds: string[] = [];

  if (scopeType === 'projects') {
    const { data: grants, error: grantsError } = await supabase
      .from('workspace_member_projects')
      .select('project_id')
      .eq('workspace_member_id', String(data.id));

    if (grantsError) {
      if (isMissingRelationError(grantsError)) {
        throw new ApiError(409, 'Workspace membership scope schema is not ready yet.');
      }
      throw new ApiError(500, grantsError.message);
    }

    projectIds = [...new Set((grants ?? []).map((row: any) => String(row.project_id)))].filter(Boolean);
    if (!projectIds.length) {
      throw new ApiError(403, 'You do not have access to any projects in this workspace.');
    }
  }

  if (scopeType === 'tours') {
    const { data: grants, error: grantsError } = await supabase
      .from('workspace_member_tours')
      .select('project_id, tour_id')
      .eq('workspace_member_id', String(data.id));

    if (grantsError) {
      if (isMissingRelationError(grantsError)) {
        throw new ApiError(409, 'Workspace tour scope schema is not ready yet.');
      }
      throw new ApiError(500, grantsError.message);
    }

    projectIds = [...new Set((grants ?? []).map((row: any) => String(row.project_id)))].filter(Boolean);
    tourIds = [...new Set((grants ?? []).map((row: any) => String(row.tour_id)))].filter(Boolean);
    if (!tourIds.length) {
      throw new ApiError(403, 'You do not have access to any tours in this workspace.');
    }
  }

  return {
    workspaceId: String(data.workspace_id),
    userId: String(data.user_id),
    role,
    scopeType,
    projectIds,
    tourIds,
  };
}

export function canAccessProject(access: WorkspaceAccess, projectId: string) {
  return canAccessProjectByScope(access.scopeType, access.projectIds, projectId);
}

export function canAccessTour(access: WorkspaceAccess, projectId: string, tourId: string | null | undefined) {
  return canAccessProjectByScope(access.scopeType, access.projectIds, projectId)
    && canAccessTourByScope(access.scopeType, access.projectIds, access.tourIds, projectId, tourId);
}

export async function ensureProjectInWorkspace(supabase: SupabaseClient, workspaceId: string, projectId: string) {
  if (!projectId) {
    throw new ApiError(400, 'projectId is required.');
  }

  const { data, error } = await supabase
    .from('projects')
    .select('id, workspace_id')
    .eq('id', projectId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Projects schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  if (!data) {
    throw new ApiError(404, 'Project not found in this workspace.');
  }
}

export async function ensureProjectAccess(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
  projectId: string,
  allowedRoles?: WorkspaceRole[],
) {
  const access = await requireWorkspaceAccess(supabase, userId, workspaceId, allowedRoles);
  await ensureProjectInWorkspace(supabase, workspaceId, projectId);

  if (!canAccessProject(access, projectId)) {
    throw new ApiError(403, 'You do not have access to this project.');
  }

  return access;
}

export async function ensureTourInScope(
  supabase: SupabaseClient,
  workspaceId: string,
  projectId: string,
  tourId: string | null | undefined,
) {
  if (!tourId) return;

  const { data, error } = await supabase
    .from('tours')
    .select('id, workspace_id, project_id')
    .eq('id', tourId)
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Tours schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  if (!data) {
    throw new ApiError(404, 'Tour not found in this workspace/project.');
  }
}

export async function ensureTourAccess(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
  projectId: string,
  tourId: string,
  allowedRoles?: WorkspaceRole[],
) {
  const access = await ensureProjectAccess(supabase, userId, workspaceId, projectId, allowedRoles);
  await ensureTourInScope(supabase, workspaceId, projectId, tourId);

  if (!canAccessTour(access, projectId, tourId)) {
    throw new ApiError(403, 'You do not have access to this tour.');
  }

  return access;
}

export function parseBooleanSearchParam(value: string | null) {
  return value === '1' || value === 'true';
}
