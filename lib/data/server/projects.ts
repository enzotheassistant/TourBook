import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingRelationError, requireWorkspaceAccess, requireScopedDataClient } from '@/lib/data/server/shared';
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
