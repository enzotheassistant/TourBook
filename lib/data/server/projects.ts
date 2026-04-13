import { getPrivilegedDataClient, isMissingRelationError, requireWorkspaceAccess } from '@/lib/data/server/shared';
import type { ProjectSummary } from '@/lib/types/tenant';

export async function listProjectsScoped(userId: string, workspaceId: string): Promise<ProjectSummary[]> {
  await requireWorkspaceAccess(userId, workspaceId);

  const supabase = getPrivilegedDataClient();
  const { data, error } = await supabase
    .from('projects')
    .select('id, workspace_id, name, slug, archived_at, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name ?? ''),
    slug: row.slug ? String(row.slug) : null,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
  }));
}
