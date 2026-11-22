import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, isMissingRelationError } from '@/lib/data/server/shared';
import { buildBandAccess, toStoredAccess, type BandAccess, type BandRole } from '@/lib/access/band-access';

// Reading and saving a person's per-band access (and an invite's), in one
// place so Team changes, invites and accepting invites all store it the same
// way. These take whichever database client the caller already checked
// permissions with.

type MemberRow = { id: string; role: string; scope_type?: string | null };

export async function readMemberBandAccess(supabase: SupabaseClient, member: MemberRow): Promise<BandAccess> {
  const memberId = String(member.id);
  const [projects, tours] = await Promise.all([
    supabase.from('workspace_member_projects').select('project_id, role').eq('workspace_member_id', memberId),
    supabase.from('workspace_member_tours').select('project_id, tour_id, role').eq('workspace_member_id', memberId),
  ]);
  if (projects.error && !isMissingRelationError(projects.error)) throw new ApiError(500, projects.error.message);
  if (tours.error && !isMissingRelationError(tours.error)) throw new ApiError(500, tours.error.message);
  return buildBandAccess({
    scopeType: member.scope_type,
    memberRole: String(member.role) as BandRole,
    projectGrants: (projects.data ?? []).map((row: any) => ({ projectId: String(row.project_id), role: row.role })),
    tourGrants: (tours.data ?? []).map((row: any) => ({ projectId: String(row.project_id), tourId: String(row.tour_id), role: row.role })),
  });
}

/** Many members at once (for the Team list). */
export async function readManyMemberBandAccess(supabase: SupabaseClient, members: MemberRow[]) {
  const ids = members.map((member) => String(member.id));
  const result = new Map<string, BandAccess>();
  if (!ids.length) return result;
  const [projects, tours] = await Promise.all([
    supabase.from('workspace_member_projects').select('workspace_member_id, project_id, role').in('workspace_member_id', ids),
    supabase.from('workspace_member_tours').select('workspace_member_id, project_id, tour_id, role').in('workspace_member_id', ids),
  ]);
  if (projects.error && !isMissingRelationError(projects.error)) throw new ApiError(500, projects.error.message);
  if (tours.error && !isMissingRelationError(tours.error)) throw new ApiError(500, tours.error.message);
  for (const member of members) {
    const id = String(member.id);
    result.set(id, buildBandAccess({
      scopeType: member.scope_type,
      memberRole: String(member.role) as BandRole,
      projectGrants: (projects.data ?? []).filter((row: any) => String(row.workspace_member_id) === id)
        .map((row: any) => ({ projectId: String(row.project_id), role: row.role })),
      tourGrants: (tours.data ?? []).filter((row: any) => String(row.workspace_member_id) === id)
        .map((row: any) => ({ projectId: String(row.project_id), tourId: String(row.tour_id), role: row.role })),
    }));
  }
  return result;
}

/** Save a member's access: their overall level, scope, and per-band records. */
export async function writeMemberBandAccess(supabase: SupabaseClient, workspaceId: string, memberId: string, access: BandAccess) {
  const stored = toStoredAccess(access);
  const { error: memberError } = await supabase
    .from('workspace_members')
    .update({ role: stored.role, scope_type: stored.scopeType })
    .eq('workspace_id', workspaceId)
    .eq('id', memberId);
  if (memberError) throw new ApiError(500, memberError.message);

  const { error: clearProjects } = await supabase.from('workspace_member_projects').delete().eq('workspace_member_id', memberId);
  if (clearProjects && !isMissingRelationError(clearProjects)) throw new ApiError(500, clearProjects.message);
  const { error: clearTours } = await supabase.from('workspace_member_tours').delete().eq('workspace_member_id', memberId);
  if (clearTours && !isMissingRelationError(clearTours)) throw new ApiError(500, clearTours.message);

  if (stored.projectRows.length) {
    const { error } = await supabase.from('workspace_member_projects').insert(stored.projectRows.map((row) => ({
      workspace_member_id: memberId, workspace_id: workspaceId, project_id: row.projectId, role: row.role,
    })));
    if (error) throw new ApiError(500, error.message);
  }
  if (stored.tourRows.length) {
    const { error } = await supabase.from('workspace_member_tours').insert(stored.tourRows.map((row) => ({
      workspace_member_id: memberId, workspace_id: workspaceId, project_id: row.projectId, tour_id: row.tourId, role: row.role,
    })));
    if (error) throw new ApiError(500, error.message);
  }
}

type InviteRow = { id: string; role: string; scope_type?: string | null };

export async function readManyInviteBandAccess(supabase: SupabaseClient, invites: InviteRow[]) {
  const ids = invites.map((invite) => String(invite.id));
  const result = new Map<string, BandAccess>();
  if (!ids.length) return result;
  const [projects, tours] = await Promise.all([
    supabase.from('workspace_invite_projects').select('invite_id, project_id, role').in('invite_id', ids),
    supabase.from('workspace_invite_tours').select('invite_id, project_id, tour_id, role').in('invite_id', ids),
  ]);
  if (projects.error && !isMissingRelationError(projects.error)) throw new ApiError(500, projects.error.message);
  if (tours.error && !isMissingRelationError(tours.error)) throw new ApiError(500, tours.error.message);
  for (const invite of invites) {
    const id = String(invite.id);
    result.set(id, buildBandAccess({
      scopeType: invite.scope_type,
      memberRole: String(invite.role) as BandRole,
      projectGrants: (projects.data ?? []).filter((row: any) => String(row.invite_id) === id)
        .map((row: any) => ({ projectId: String(row.project_id), role: row.role })),
      tourGrants: (tours.data ?? []).filter((row: any) => String(row.invite_id) === id)
        .map((row: any) => ({ projectId: String(row.project_id), tourId: String(row.tour_id), role: row.role })),
    }));
  }
  return result;
}

/** Save the per-band records for a new invite. */
export async function writeInviteBandRows(supabase: SupabaseClient, workspaceId: string, inviteId: string, access: BandAccess) {
  const stored = toStoredAccess(access);
  if (stored.projectRows.length) {
    const { error } = await supabase.from('workspace_invite_projects').insert(stored.projectRows.map((row) => ({
      invite_id: inviteId, workspace_id: workspaceId, project_id: row.projectId, role: row.role,
    })));
    if (error) throw new ApiError(500, error.message);
  }
  if (stored.tourRows.length) {
    const { error } = await supabase.from('workspace_invite_tours').insert(stored.tourRows.map((row) => ({
      invite_id: inviteId, workspace_id: workspaceId, project_id: row.projectId, tour_id: row.tourId, role: row.role,
    })));
    if (error) throw new ApiError(500, error.message);
  }
}

/**
 * Check that every band and tour in an access list belongs to this workspace,
 * and fill in each tour's band. Returns the cleaned list.
 */
export async function validateAccessInWorkspace(supabase: SupabaseClient, workspaceId: string, access: BandAccess): Promise<BandAccess> {
  if (access.allProjects) return access;
  const projectIds = [...new Set(access.entries.map((entry) => entry.projectId))];
  if (!projectIds.length) return access;
  const { data: projects, error } = await supabase.from('projects').select('id').eq('workspace_id', workspaceId).in('id', projectIds);
  if (error) throw new ApiError(500, error.message);
  const found = new Set((projects ?? []).map((row: any) => String(row.id)));
  if (projectIds.some((id) => !found.has(id))) {
    throw new ApiError(400, 'One or more selected projects do not belong to this workspace.');
  }
  const tourIds = [...new Set(access.entries.flatMap((entry) => entry.tourIds))];
  if (tourIds.length) {
    const { data: tours, error: toursError } = await supabase.from('tours').select('id, project_id').eq('workspace_id', workspaceId).in('id', tourIds);
    if (toursError) throw new ApiError(500, toursError.message);
    const projectByTour = new Map((tours ?? []).map((row: any) => [String(row.id), String(row.project_id)]));
    for (const entry of access.entries) {
      for (const tourId of entry.tourIds) {
        if (projectByTour.get(tourId) !== entry.projectId) {
          throw new ApiError(400, 'One or more selected tours do not belong to that project.');
        }
      }
    }
  }
  return access;
}
