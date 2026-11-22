import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, getPrivilegedDataClient, isMissingRelationError, requireScopedDataClient, requireWorkspaceAccess } from '@/lib/data/server/shared';
import { MemberUpdateValidationError, validateWorkspaceMemberUpdatePayload } from '@/lib/data/server/member-update-utils';
import type { WorkspaceMemberDirectoryEntry, WorkspaceRole, WorkspaceScopeType } from '@/lib/types/tenant';
import { canGrantBandEntry, canManageWholeAccess, hasFullWorkspaceControl, isManagerAssignableRole, managedProjectIdsFor, sharesBandWith } from '@/lib/data/server/manager-scope';
import { applyManagerEdits, highestRole, newlyAddedProjects, normalizeEntries, type BandAccess, type BandRole } from '@/lib/access/band-access';
import { readManyMemberBandAccess, readMemberBandAccess, validateAccessInWorkspace, writeMemberBandAccess } from '@/lib/data/server/member-access-store';

// Team members, per band: each person has a level on each band they can open
// (or one level for all projects). Owners manage everyone; Managers only the
// bands they manage — every other band a person has is left untouched.

function normalizeScopeType(value: unknown): WorkspaceScopeType {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || raw === 'workspace') return 'workspace';
  if (raw === 'projects') return 'projects';
  if (raw === 'tours') return 'tours';
  return 'workspace';
}

function deriveDisplayName(user: any) {
  const meta = user?.user_metadata ?? user?.raw_user_meta_data ?? {};
  const fullName = String(meta.full_name ?? meta.name ?? meta.display_name ?? '').trim();
  if (fullName) return fullName;
  const first = String(meta.first_name ?? '').trim();
  const last = String(meta.last_name ?? '').trim();
  const combined = [first, last].filter(Boolean).join(' ').trim();
  return combined || null;
}

async function getUserDirectoryInfoByUserId(userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueUserIds.length) return new Map<string, { email: string | null; name: string | null }>();

  try {
    const supabase = getPrivilegedDataClient();
    const entries = await Promise.all(uniqueUserIds.map(async (userId) => {
      try {
        const response = await supabase.auth.admin.getUserById(userId);
        return [userId, { email: response.data.user?.email ?? null, name: deriveDisplayName(response.data.user) }] as const;
      } catch {
        return [userId, { email: null, name: null }] as const;
      }
    }));
    return new Map(entries);
  } catch {
    return new Map(uniqueUserIds.map((userId) => [userId, { email: null, name: null }]));
  }
}

async function readWorkspaceMemberById(supabase: SupabaseClient, workspaceId: string, memberId: string) {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('id, workspace_id, user_id, role, scope_type, created_at')
    .eq('workspace_id', workspaceId)
    .eq('id', memberId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) throw new ApiError(409, 'Workspace membership schema is not ready yet.');
    throw new ApiError(500, error.message);
  }
  if (!data) throw new ApiError(404, 'Member not found.');
  return data;
}

/** Trim someone's access to the bands the viewer can see (Managers don't see other bands). */
function visibleAccess(access: BandAccess, viewer: BandAccess | null): BandAccess {
  if (!viewer || viewer.allProjects || access.allProjects) return access;
  const mine = new Set(viewer.entries.map((entry) => entry.projectId));
  const entries = access.entries.filter((entry) => mine.has(entry.projectId));
  return { allProjects: false, role: highestRole(entries.map((entry) => entry.role)), entries };
}

function toDirectoryEntry(row: any, access: BandAccess, info: { email: string | null; name: string | null }): WorkspaceMemberDirectoryEntry {
  const scopeType = normalizeScopeType(row.scope_type);
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    userId: String(row.user_id),
    name: info.name,
    email: info.email,
    role: (access.allProjects ? access.role : access.role ?? row.role) as WorkspaceRole,
    scopeType,
    projectIds: access.allProjects ? [] : access.entries.map((entry) => entry.projectId),
    tourIds: access.allProjects ? [] : [...new Set(access.entries.flatMap((entry) => entry.tourIds))],
    createdAt: row.created_at ? String(row.created_at) : null,
    access,
  } satisfies WorkspaceMemberDirectoryEntry;
}

async function requireTeamActor(authSupabase: SupabaseClient, userId: string, workspaceId: string) {
  const actor = await requireWorkspaceAccess(authSupabase, userId, workspaceId);
  const fullControl = hasFullWorkspaceControl(actor.role);
  const managesSomething = actor.bandAccess.allProjects
    ? ['owner', 'admin', 'editor'].includes(actor.bandAccess.role)
    : actor.bandAccess.entries.some((entry) => ['owner', 'admin', 'editor'].includes(entry.role));
  if (!fullControl && !managesSomething) {
    throw new ApiError(403, 'You do not have permission to perform this action.');
  }
  return { actor, fullControl };
}

export async function listWorkspaceMembersScoped(supabaseInput: SupabaseClient, userId: string, workspaceId: string) {
  const authSupabase = requireScopedDataClient(supabaseInput);
  const { actor, fullControl } = await requireTeamActor(authSupabase, userId, workspaceId);

  const supabase = getPrivilegedDataClient();
  const { data, error } = await supabase
    .from('workspace_members')
    .select('id, workspace_id, user_id, role, scope_type, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) return [] satisfies WorkspaceMemberDirectoryEntry[];
    throw new ApiError(500, error.message);
  }

  const rows = data ?? [];
  const [accessByMember, directoryInfoByUserId] = await Promise.all([
    readManyMemberBandAccess(supabase, rows as any[]),
    getUserDirectoryInfoByUserId(rows.map((row: any) => String(row.user_id))),
  ]);

  return rows.flatMap((row: any) => {
    const access = accessByMember.get(String(row.id));
    if (!access) return [];
    // Managers only see people who share a band with them, and only those bands.
    if (!fullControl && !sharesBandWith(actor.bandAccess, access)) return [];
    const shown = fullControl ? access : visibleAccess(access, actor.bandAccess);
    const info = directoryInfoByUserId.get(String(row.user_id)) ?? { email: null, name: null };
    return [toDirectoryEntry(row, shown, info)];
  });
}

/** Turn the request body into the wanted access (new per-band form, or the older single-level form). */
function desiredAccessFromInput(input: {
  access?: unknown;
  role?: unknown;
  scopeType?: unknown;
  projectIds?: unknown;
  tourIds?: unknown;
}, tourProjectById: Map<string, string>): BandAccess {
  const raw = input.access as { allProjects?: unknown; role?: unknown; entries?: unknown } | undefined;
  if (raw && typeof raw === 'object') {
    if (raw.allProjects === true) {
      const role = String(raw.role ?? '') as BandRole;
      if (!['admin', 'editor', 'crew', 'viewer'].includes(role)) throw new ApiError(400, 'Choose Viewer, Crew or Manager.');
      return { allProjects: true, role, entries: [] };
    }
    const entries = normalizeEntries(Array.isArray(raw.entries) ? raw.entries : []);
    return { allProjects: false, role: highestRole(entries.map((entry) => entry.role)), entries };
  }

  // Older form: one level + one kind of scope.
  let payload;
  try {
    payload = validateWorkspaceMemberUpdatePayload(input);
  } catch (error) {
    if (error instanceof MemberUpdateValidationError) throw new ApiError(error.status, error.message);
    throw error;
  }
  if (payload.role === 'owner') throw new ApiError(400, 'Use workspace ownership transfer instead of assigning owner here.');
  const role = payload.role as BandRole;
  if (payload.scopeType === 'workspace') return { allProjects: true, role, entries: [] };
  if (payload.scopeType === 'projects') {
    const entries = payload.projectIds.map((projectId) => ({ projectId, role, tourIds: [] as string[] }));
    return { allProjects: false, role, entries };
  }
  const byProject = new Map<string, string[]>();
  for (const tourId of payload.tourIds) {
    const projectId = tourProjectById.get(tourId);
    if (!projectId) throw new ApiError(404, 'Tour not found in this workspace.');
    byProject.set(projectId, [...(byProject.get(projectId) ?? []), tourId]);
  }
  const entries = [...byProject.entries()].map(([projectId, tourIds]) => ({ projectId, role, tourIds }));
  return { allProjects: false, role, entries };
}

export async function updateWorkspaceMemberScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { workspaceId: string; memberId: string; access?: unknown; role?: unknown; scopeType?: unknown; projectIds?: unknown; tourIds?: unknown },
): Promise<WorkspaceMemberDirectoryEntry & { removed?: boolean; addedProjectIds?: string[] }> {
  const authSupabase = requireScopedDataClient(supabaseInput);
  const supabase = getPrivilegedDataClient();
  const workspaceId = String(input.workspaceId ?? '').trim();
  const memberId = String(input.memberId ?? '').trim();

  if (!workspaceId) throw new ApiError(400, 'workspaceId is required.');
  if (!memberId) throw new ApiError(400, 'memberId is required.');

  const { actor, fullControl } = await requireTeamActor(authSupabase, userId, workspaceId);
  const existing = await readWorkspaceMemberById(supabase, workspaceId, memberId);
  const targetRole = String(existing.role) as WorkspaceRole;
  const targetUserId = String(existing.user_id);

  if (targetUserId === userId) {
    throw new ApiError(409, 'Use a dedicated account flow instead of editing your own membership here.');
  }
  if (targetRole === 'owner') {
    throw new ApiError(409, 'Workspace owner cannot be edited from Team.');
  }
  if (actor.role !== 'owner' && targetRole === 'admin') {
    throw new ApiError(403, 'Only the workspace owner can edit another admin.');
  }

  const current = await readMemberBandAccess(supabase, existing as any);

  // For the older single-level form with tours, look up which band each tour is on.
  const legacyTourIds = Array.isArray(input.tourIds) ? (input.tourIds as unknown[]).map(String) : [];
  const tourProjectById = new Map<string, string>();
  if (!input.access && legacyTourIds.length) {
    const { data: tours } = await supabase.from('tours').select('id, project_id').eq('workspace_id', workspaceId).in('id', legacyTourIds);
    for (const row of tours ?? []) tourProjectById.set(String((row as any).id), String((row as any).project_id));
  }

  const desired = await validateAccessInWorkspace(supabase, workspaceId, desiredAccessFromInput(input, tourProjectById));

  // The retired admin level can only be kept, never newly given.
  const usesAdmin = desired.allProjects ? desired.role === 'admin' : desired.entries.some((entry) => entry.role === 'admin');
  if (usesAdmin && targetRole !== 'admin') throw new ApiError(400, 'Choose Viewer, Crew or Manager.');
  if (usesAdmin && actor.role !== 'owner') throw new ApiError(403, 'Only the workspace owner can assign admin access.');

  let next: BandAccess;
  if (fullControl) {
    next = desired;
  } else {
    // Managers: only their bands change; everything else stays as it was.
    if (current.allProjects && !canManageWholeAccess(actor.bandAccess, current)) {
      throw new ApiError(403, 'This person has access beyond the projects you manage. Ask the workspace owner to change it.');
    }
    if (desired.allProjects) {
      if (!(actor.bandAccess.allProjects && isManagerAssignableRole(desired.role) && ['owner', 'admin', 'editor'].includes(actor.bandAccess.role))) {
        throw new ApiError(403, 'You can only give access to projects you manage.');
      }
      next = desired;
    } else {
      const candidateIds = [
        ...(current.allProjects ? [] : current.entries.map((entry) => entry.projectId)),
        ...desired.entries.map((entry) => entry.projectId),
      ];
      const managed = managedProjectIdsFor(actor.bandAccess, candidateIds);
      const sameAsNow = (entry: { projectId: string; role: string; tourIds: string[] }) => {
        if (current.allProjects) return false;
        const now = current.entries.find((item) => item.projectId === entry.projectId);
        return !!now && now.role === entry.role && [...now.tourIds].sort().join() === [...entry.tourIds].sort().join();
      };
      for (const entry of desired.entries) {
        if (!managed.includes(entry.projectId)) continue; // other bands: ignored, kept as they are
        if (sameAsNow(entry)) continue;
        if (!canGrantBandEntry(actor.bandAccess, entry)) {
          throw new ApiError(403, 'You can only give access to projects you manage.');
        }
      }
      // A band the actor manages only partly (some tours) can't be taken away from someone with the whole band.
      if (!current.allProjects) {
        for (const entry of current.entries) {
          if (managed.includes(entry.projectId) && !canGrantBandEntry(actor.bandAccess, entry)) {
            const stillSame = desired.entries.find((item) => item.projectId === entry.projectId);
            if (!stillSame || !sameAsNow(stillSame)) {
              throw new ApiError(403, 'This person has access beyond the projects you manage. Ask the workspace owner to change it.');
            }
          }
        }
      }
      next = current.allProjects ? current : applyManagerEdits({ current, edits: desired.entries, managedProjectIds: managed });
    }
  }

  const info = (await getUserDirectoryInfoByUserId([targetUserId])).get(targetUserId) ?? { email: null, name: null };

  // No bands left: they're no longer on the team.
  if (!next.allProjects && next.entries.length === 0) {
    const { error: deleteError } = await supabase.from('workspace_members').delete().eq('workspace_id', workspaceId).eq('id', memberId);
    if (deleteError) throw new ApiError(500, deleteError.message);
    return { ...toDirectoryEntry(existing, { allProjects: false, role: null, entries: [] }, info), removed: true, addedProjectIds: [] };
  }

  await writeMemberBandAccess(supabase, workspaceId, memberId, next);
  const updated = await readWorkspaceMemberById(supabase, workspaceId, memberId);
  const shown = fullControl ? next : visibleAccess(next, actor.bandAccess);
  return {
    ...toDirectoryEntry(updated, shown, info),
    addedProjectIds: newlyAddedProjects(current, next),
  };
}

export async function removeWorkspaceMemberScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { workspaceId: string; memberId: string },
) {
  const authSupabase = requireScopedDataClient(supabaseInput);
  const supabase = getPrivilegedDataClient();
  const workspaceId = String(input.workspaceId ?? '').trim();
  const memberId = String(input.memberId ?? '').trim();

  if (!workspaceId) throw new ApiError(400, 'workspaceId is required.');
  if (!memberId) throw new ApiError(400, 'memberId is required.');

  const { actor, fullControl } = await requireTeamActor(authSupabase, userId, workspaceId);
  const existing = await readWorkspaceMemberById(supabase, workspaceId, memberId);
  const targetRole = String(existing.role) as WorkspaceRole;
  const targetUserId = String(existing.user_id);

  if (targetUserId === userId) {
    throw new ApiError(409, 'Use a separate leave-workspace flow instead of removing yourself here.');
  }
  if (targetRole === 'owner') {
    throw new ApiError(409, 'Workspace owner cannot be removed from Team.');
  }
  if (actor.role !== 'owner' && targetRole === 'admin') {
    throw new ApiError(403, 'Only the workspace owner can remove another admin.');
  }
  if (!fullControl) {
    const current = await readMemberBandAccess(supabase, existing as any);
    if (!canManageWholeAccess(actor.bandAccess, current)) {
      throw new ApiError(403, 'This person has access beyond the projects you manage. Ask the workspace owner to remove them.');
    }
  }

  const { error: deleteError } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', memberId);

  if (deleteError) {
    if (isMissingRelationError(deleteError)) throw new ApiError(409, 'Workspace membership schema is not ready yet.');
    throw new ApiError(500, deleteError.message);
  }

  return { ok: true };
}
