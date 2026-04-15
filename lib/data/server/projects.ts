import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, isMissingRelationError, requireWorkspaceAccess, requireScopedDataClient } from '@/lib/data/server/shared';
import type { ProjectSummary } from '@/lib/types/tenant';

export async function listProjectsScoped(supabaseInput: SupabaseClient, userId: string, workspaceId: string): Promise<ProjectSummary[]> {
  const supabase = requireScopedDataClient(supabaseInput);
  await requireWorkspaceAccess(supabase, userId, workspaceId);

  const { data, error } = await supabase
    .from('projects')
    .select('id, workspace_id, name, slug, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .limit(200);

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
  await requireWorkspaceAccess(supabase, userId, input.workspaceId, ['owner', 'admin', 'editor']);

  const name = input.name.trim();
  if (!name) {
    throw new ApiError(400, 'Artist name is required.');
  }

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
