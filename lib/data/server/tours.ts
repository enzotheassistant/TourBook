import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureProjectAccess, isMissingRelationError, requireScopedDataClient } from '@/lib/data/server/shared';
import type { TourSummary } from '@/lib/types/tenant';

function rowToTourSummary(row: any): TourSummary {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    name: String(row.name ?? ''),
    status: String(row.status ?? ''),
    startDate: row.start_date ? String(row.start_date) : null,
    endDate: row.end_date ? String(row.end_date) : null,
  };
}

const TOUR_SELECT = 'id, workspace_id, project_id, name, status, start_date, end_date';

/**
 * Find or create a tour entity by name within a workspace/project.
 * Called automatically when a date is saved with a legacy_tour_name so that
 * the tours table stays in sync and the invite-scope dropdown is populated.
 */
export async function upsertTourByName(
  supabase: SupabaseClient,
  workspaceId: string,
  projectId: string,
  name: string,
): Promise<TourSummary> {
  const trimmedName = name.trim();

  // Check for existing tour with this name
  const { data: existing, error: lookupError } = await supabase
    .from('tours')
    .select(TOUR_SELECT)
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .eq('name', trimmedName)
    .maybeSingle();

  if (lookupError && !isMissingRelationError(lookupError)) {
    throw new Error(lookupError.message);
  }

  if (existing) {
    return rowToTourSummary(existing);
  }

  // Create a new tour entity
  const { data: created, error: insertError } = await supabase
    .from('tours')
    .insert({ workspace_id: workspaceId, project_id: projectId, name: trimmedName })
    .select(TOUR_SELECT)
    .single();

  if (insertError) {
    if (isMissingRelationError(insertError)) {
      throw new Error('Tours schema is not ready yet.');
    }
    throw new Error(insertError.message);
  }

  return rowToTourSummary(created);
}

export async function listToursScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string,
  projectId: string,
): Promise<TourSummary[]> {
  const supabase = requireScopedDataClient(supabaseInput);
  await ensureProjectAccess(supabase, userId, workspaceId, projectId);

  const { data, error } = await supabase
    .from('tours')
    .select('id, workspace_id, project_id, name, start_date, end_date, created_at')
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map(rowToTourSummary);
}
