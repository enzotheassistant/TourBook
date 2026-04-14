import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureProjectInWorkspace, isMissingRelationError, requireWorkspaceAccess, requireScopedDataClient } from '@/lib/data/server/shared';
import type { TourSummary } from '@/lib/types/tenant';

export async function listToursScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string,
  projectId: string,
): Promise<TourSummary[]> {
  const supabase = requireScopedDataClient(supabaseInput);
  await requireWorkspaceAccess(supabase, userId, workspaceId);
  await ensureProjectInWorkspace(supabase, workspaceId, projectId);

  const { data, error } = await supabase
    .from('tours')
    .select('id, workspace_id, project_id, name, status, start_date, end_date, created_at')
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    name: String(row.name ?? ''),
    status: String(row.status ?? ''),
    startDate: row.start_date ? String(row.start_date) : null,
    endDate: row.end_date ? String(row.end_date) : null,
  }));
}
