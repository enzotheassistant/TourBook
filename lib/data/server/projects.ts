import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, isMissingRelationError, requireWorkspaceAccess, requireScopedDataClient } from '@/lib/data/server/shared';
import type { ProjectSummary } from '@/lib/types/tenant';

function normalizeProjectName(value: string) {
  return value.trim().replace(/s+/g, ' ');
}

async function assertProjectNameAvailable(
  supabase: SupabaseClient,
  workspaceId: string,
  name: string,
  excludeProjectId?: string,
) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .ilike('name', name)
    .limit(20);

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Projects schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  const normalized = name.toLowerCase();
  const duplicate = (data ?? []).some((row: any) => {
    const sameId = excludeProjectId && String(row.id) === excludeProjectId;
    if (sameId) return false;
    const rowName = String(row.name ?? '').trim().replace(/s+/g, ' ').toLowerCase();
    return rowName === normalized;
  });

  if (duplicate) {
    throw new ApiError(409, 'An artist with this name already exists in this workspace.');
  }
}

export async function listProjectsScoped(supabaseInput: SupabaseClient, userId: string, workspaceId: string): Promise<ProjectSummary[]> {
  const supabase = requireScopedDataClient(supabaseInput);
  const access = await requireWorkspaceAccess(supabase, userId, workspaceId);

  let query = supabase
    .from('projects')
    .select('id, workspace_id, name, slug, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (access.scopeType === 'projects') {
    query = query.in('id', access.projectIds);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name ?? ''),
    slug: row.slug ? String(row.slug) : null,
    archivedAt: null,
  }));
}

export async function createProjectScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { workspaceId: string; name: string; slug?: string | null },
): Promise<ProjectSummary> {
  const supabase = requireScopedDataClient(supabaseInput);
  const access = await requireWorkspaceAccess(supabase, userId, input.workspaceId, ['owner', 'admin']);

  if (access.scopeType !== 'workspace') {
    throw new ApiError(403, 'Project-limited members cannot create new artists.');
  }

  const name = normalizeProjectName(input.name);
  if (!name) {
    throw new ApiError(400, 'Artist name is required.');
  }

  if (name.length > 120) {
    throw new ApiError(400, 'Artist name must be 120 characters or fewer.');
  }

  await assertProjectNameAvailable(supabase, input.workspaceId, name);

  const slug = typeof input.slug === 'string' && input.slug.trim() ? input.slug.trim() : null;

  const { data, error } = await supabase
    .from('projects')
    .insert({
      workspace_id: input.workspaceId,
      name,
      slug,
    })
    .select('id, workspace_id, name, slug, created_at')
    .single();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Projects schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  return {
    id: String(data.id),
    workspaceId: String(data.workspace_id),
    name: String(data.name ?? ''),
    slug: data.slug ? String(data.slug) : null,
    archivedAt: null,
  };
}


export async function renameProjectScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { workspaceId: string; projectId: string; name: string },
): Promise<ProjectSummary> {
  const supabase = requireScopedDataClient(supabaseInput);
  const access = await requireWorkspaceAccess(supabase, userId, input.workspaceId, ['owner', 'admin']);

  if (access.scopeType !== 'workspace') {
    throw new ApiError(403, 'Project-limited members cannot rename artists.');
  }

  const name = normalizeProjectName(input.name);
  if (!name) {
    throw new ApiError(400, 'Artist name is required.');
  }

  if (name.length > 120) {
    throw new ApiError(400, 'Artist name must be 120 characters or fewer.');
  }

  await assertProjectNameAvailable(supabase, input.workspaceId, name, input.projectId);

  const { data, error } = await supabase
    .from('projects')
    .update({ name })
    .eq('id', input.projectId)
    .eq('workspace_id', input.workspaceId)
    .select('id, workspace_id, name, slug, created_at')
    .single();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Projects schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  if (!data) {
    throw new ApiError(404, 'Artist not found.');
  }

  return {
    id: String(data.id),
    workspaceId: String(data.workspace_id),
    name: String(data.name ?? ''),
    slug: data.slug ? String(data.slug) : null,
    archivedAt: null,
  };
}
