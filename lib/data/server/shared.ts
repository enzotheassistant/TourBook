import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server';
import type { WorkspaceRole } from '@/lib/types/tenant';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeCode = 'code' in error ? String((error as { code?: string }).code ?? '') : '';
  const maybeMessage = 'message' in error ? String((error as { message?: string }).message ?? '') : '';
  return maybeCode === '42P01' || maybeMessage.toLowerCase().includes('does not exist');
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

export async function requireWorkspaceAccess(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
  allowedRoles?: WorkspaceRole[],
) {
  if (!workspaceId) {
    throw new ApiError(400, 'workspaceId is required.');
  }

  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, user_id, role')
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

  return {
    workspaceId: String(data.workspace_id),
    userId: String(data.user_id),
    role,
  };
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

export function parseBooleanSearchParam(value: string | null) {
  return value === '1' || value === 'true';
}
