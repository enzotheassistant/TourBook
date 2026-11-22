import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server';
import type { WorkspaceRole } from '@/lib/types/tenant';
import { buildBandAccess, canReachDate, roleForProject, type BandAccess } from '@/lib/access/band-access';

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
  /** The person's highest level across their bands (their level everywhere for "all projects"). */
  role: WorkspaceRole;
  scopeType: WorkspaceAccessScopeType;
  /** Every band they can open (whole band or only some tours). */
  projectIds: string[];
  /** Tours they have when a band is limited to some tours. */
  tourIds: string[];
  /** Per-band levels. Use roleForAccessProject() rather than `role` for anything tied to a band. */
  bandAccess: BandAccess;
};

/** The person's level on one band, or null if they can't open it. */
export function roleForAccessProject(access: WorkspaceAccess, projectId: string | null | undefined): WorkspaceRole | null {
  return roleForProject(access.bandAccess, projectId) as WorkspaceRole | null;
}

/** Throws 403 unless the person's level on this band is one of `allowedRoles`. */
export function requireProjectRole(access: WorkspaceAccess, projectId: string, allowedRoles: readonly WorkspaceRole[]) {
  const role = roleForAccessProject(access, projectId);
  if (!role || !allowedRoles.includes(role)) {
    throw new ApiError(403, 'You do not have permission to perform this action.');
  }
  return role;
}

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
  let projectGrants: Array<{ projectId: string; role: string | null }> = [];
  let tourGrants: Array<{ projectId: string; tourId: string; role: string | null }> = [];

  // Anyone not on "all projects" can have whole-band access on some bands and
  // only-some-tours on others, each with its own level.
  if (scopeType !== 'workspace') {
    const [projectResult, tourResult] = await Promise.all([
      supabase.from('workspace_member_projects').select('project_id, role').eq('workspace_member_id', String(data.id)),
      supabase.from('workspace_member_tours').select('project_id, tour_id, role').eq('workspace_member_id', String(data.id)),
    ]);

    if (projectResult.error) {
      if (isMissingRelationError(projectResult.error)) {
        throw new ApiError(409, 'Workspace membership scope schema is not ready yet.');
      }
      throw new ApiError(500, projectResult.error.message);
    }
    if (tourResult.error && !isMissingRelationError(tourResult.error)) {
      throw new ApiError(500, tourResult.error.message);
    }

    projectGrants = (projectResult.data ?? []).map((row: any) => ({ projectId: String(row.project_id), role: row.role ? String(row.role) : null }));
    tourGrants = (tourResult.data ?? []).map((row: any) => ({ projectId: String(row.project_id), tourId: String(row.tour_id), role: row.role ? String(row.role) : null }));

    if (!projectGrants.length && !tourGrants.length) {
      throw new ApiError(403, 'You do not have access to any projects in this workspace.');
    }
  }

  const bandAccess = buildBandAccess({ scopeType, memberRole: role, projectGrants, tourGrants });
  const projectIds = bandAccess.allProjects ? [] : bandAccess.entries.map((entry) => entry.projectId);
  const tourIds = bandAccess.allProjects ? [] : [...new Set(bandAccess.entries.flatMap((entry) => entry.tourIds))];

  return {
    workspaceId: String(data.workspace_id),
    userId: String(data.user_id),
    role,
    scopeType,
    projectIds,
    tourIds,
    bandAccess,
  };
}

export function canAccessProject(access: WorkspaceAccess, projectId: string) {
  return !!projectId && roleForProject(access.bandAccess, projectId) !== null;
}

export function canAccessTour(access: WorkspaceAccess, projectId: string, tourId: string | null | undefined) {
  return !!projectId && canReachDate(access.bandAccess, projectId, tourId);
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
  const access = await requireWorkspaceAccess(supabase, userId, workspaceId);
  await ensureProjectInWorkspace(supabase, workspaceId, projectId);

  if (!canAccessProject(access, projectId)) {
    throw new ApiError(403, 'You do not have access to this project.');
  }

  // Levels are per band: check the level on THIS band.
  if (allowedRoles) requireProjectRole(access, projectId, allowedRoles);

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
