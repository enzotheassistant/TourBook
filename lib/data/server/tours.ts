import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, ensureProjectAccess, getPrivilegedDataClient, isMissingRelationError, requireScopedDataClient } from '@/lib/data/server/shared';
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
    archivedAt: row.archived_at ? String(row.archived_at) : null,
  };
}

// Only columns the tours table actually has. (This used to also ask for
// status/start_date/end_date, which don't exist, so finding or creating a
// tour quietly failed every time.)
const TOUR_SELECT = 'id, workspace_id, project_id, name, created_at, archived_at';

const MANAGE_TOUR_ROLES = ['owner', 'admin', 'editor'] as const;

function sameTourName(a: unknown, b: unknown) {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

/**
 * Find or create a tour entity by name within a workspace/project.
 * Called automatically when a date is saved with a tour name so that the
 * tours table stays in sync and the invite-scope dropdown is populated.
 * Saving a date into an archived tour brings that tour back.
 */
export async function upsertTourByName(
  supabase: SupabaseClient,
  workspaceId: string,
  projectId: string,
  name: string,
): Promise<TourSummary> {
  const trimmedName = name.trim();

  const { data: candidates, error: lookupError } = await supabase
    .from('tours')
    .select(TOUR_SELECT)
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .limit(500);

  if (lookupError && !isMissingRelationError(lookupError)) {
    throw new Error(lookupError.message);
  }

  const existing = (candidates ?? []).find((row: any) => sameTourName(row.name, trimmedName));
  if (existing) {
    if (existing.archived_at) {
      const { data: restored } = await supabase
        .from('tours')
        .update({ archived_at: null })
        .eq('id', existing.id)
        .select(TOUR_SELECT)
        .maybeSingle();
      if (restored) return rowToTourSummary(restored);
    }
    return rowToTourSummary(existing);
  }

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

export type TourWithUsage = TourSummary & {
  /** How many dates use this tour (by link or by name). */
  dateCount: number;
  /** The latest date on this tour (YYYY-MM-DD), if any. */
  lastDate: string | null;
};

export async function listToursScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  workspaceId: string,
  projectId: string,
): Promise<TourWithUsage[]> {
  const supabase = requireScopedDataClient(supabaseInput);
  await ensureProjectAccess(supabase, userId, workspaceId, projectId);

  const { data, error } = await supabase
    .from('tours')
    .select(TOUR_SELECT)
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new Error(error.message);
  }

  const { data: dateRows } = await supabase
    .from('dates')
    .select('date, tour_id, legacy_tour_name')
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .limit(2000);

  return (data ?? []).map((row: any) => {
    const matching = (dateRows ?? []).filter((date: any) =>
      String(date.tour_id ?? '') === String(row.id) || sameTourName(date.legacy_tour_name, row.name));
    const lastDate = matching.reduce<string | null>((latest, date: any) => {
      const value = date.date ? String(date.date) : null;
      return value && (!latest || value > latest) ? value : latest;
    }, null);
    return { ...rowToTourSummary(row), dateCount: matching.length, lastDate };
  });
}

async function readTourForManager(supabase: SupabaseClient, userId: string, workspaceId: string, tourId: string) {
  const { data: tour, error } = await supabase
    .from('tours')
    .select(TOUR_SELECT)
    .eq('id', tourId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!tour) throw new ApiError(404, 'Tour not found.');
  await ensureProjectAccess(supabase, userId, workspaceId, String(tour.project_id), [...MANAGE_TOUR_ROLES]);
  return tour;
}

/** Archive (hide from the Tour dropdown) or restore a tour. Dates keep their tour name. */
export async function setTourArchivedScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { workspaceId: string; tourId: string; archived: boolean },
): Promise<TourSummary> {
  const supabase = requireScopedDataClient(supabaseInput);
  await readTourForManager(supabase, userId, input.workspaceId, input.tourId);

  const { data, error } = await supabase
    .from('tours')
    .update({ archived_at: input.archived ? new Date().toISOString() : null })
    .eq('id', input.tourId)
    .eq('workspace_id', input.workspaceId)
    .select(TOUR_SELECT)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(403, 'You do not have permission to change this tour.');
  return rowToTourSummary(data);
}

/** Delete a tour — only allowed when no dates use it and nobody's access is tied to it. */
export async function deleteTourScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { workspaceId: string; tourId: string },
) {
  const supabase = requireScopedDataClient(supabaseInput);
  const tour = await readTourForManager(supabase, userId, input.workspaceId, input.tourId);

  const { data: dateRows, error: datesError } = await supabase
    .from('dates')
    .select('id, tour_id, legacy_tour_name')
    .eq('workspace_id', input.workspaceId)
    .eq('project_id', String(tour.project_id))
    .limit(2000);
  if (datesError) throw new ApiError(500, datesError.message);
  const inUse = (dateRows ?? []).some((date: any) =>
    String(date.tour_id ?? '') === input.tourId || sameTourName(date.legacy_tour_name, tour.name));
  if (inUse) {
    throw new ApiError(409, 'This tour has dates, so it can only be archived.');
  }

  // Checked with the server's own access: a Manager can't see other people's
  // access records, but deleting the tour would remove that access.
  const { count: accessCount } = await getPrivilegedDataClient()
    .from('workspace_member_tours')
    .select('tour_id', { count: 'exact', head: true })
    .eq('tour_id', input.tourId);
  if ((accessCount ?? 0) > 0) {
    throw new ApiError(409, 'Some people have access to just this tour. Change their access first, or archive the tour instead.');
  }

  const { error } = await supabase
    .from('tours')
    .delete()
    .eq('id', input.tourId)
    .eq('workspace_id', input.workspaceId);
  if (error) throw new ApiError(500, error.message);
  return { ok: true };
}
