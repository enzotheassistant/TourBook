import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, getPrivilegedDataClient, isMissingRelationError, requireScopedDataClient, requireWorkspaceAccess } from '@/lib/data/server/shared';
import { buildInviteExpiry, generateInviteToken, hashInviteToken, normalizeInviteEmail, validateInviteRole, type WorkspaceInviteRole } from '@/lib/invites/security';
import type { WorkspaceScopeType } from '@/lib/types/tenant';

export type WorkspaceInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export type WorkspaceInviteSummary = {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceInviteRole;
  scopeType: WorkspaceScopeType;
  projectIds: string[];
  tourIds: string[];
  status: WorkspaceInviteStatus;
  invitedByUserId: string;
  acceptedByUserId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

function normalizeScopeType(value: unknown): WorkspaceScopeType {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || raw === 'workspace') return 'workspace';
  if (raw === 'projects') return 'projects';
  if (raw === 'tours') return 'tours';
  throw new ApiError(400, 'scopeType must be workspace, projects, or tours.');
}

function mapInviteRow(row: any, projectIds: string[] = [], tourIds: string[] = []): WorkspaceInviteSummary {
  const now = Date.now();
  const expiresAtMs = new Date(String(row.expires_at)).getTime();
  const status = String(row.status) as WorkspaceInviteStatus;
  const computedStatus: WorkspaceInviteStatus = status === 'pending' && Number.isFinite(expiresAtMs) && expiresAtMs <= now ? 'expired' : status;

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    email: String(row.email),
    role: String(row.role) as WorkspaceInviteRole,
    scopeType: normalizeScopeType(row.scope_type),
    projectIds,
    tourIds,
    status: computedStatus,
    invitedByUserId: String(row.invited_by_user_id),
    acceptedByUserId: row.accepted_by_user_id ? String(row.accepted_by_user_id) : null,
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function getInviteProjectIds(supabase: SupabaseClient, inviteIds: string[]) {
  if (!inviteIds.length) return new Map<string, string[]>();

  const { data, error } = await supabase
    .from('workspace_invite_projects')
    .select('invite_id, project_id')
    .in('invite_id', inviteIds);

  if (error) {
    if (isMissingRelationError(error)) return new Map<string, string[]>();
    throw new ApiError(500, error.message);
  }

  return (data ?? []).reduce((map: Map<string, string[]>, row: any) => {
    const inviteId = String(row.invite_id);
    const next = map.get(inviteId) ?? [];
    next.push(String(row.project_id));
    map.set(inviteId, next);
    return map;
  }, new Map<string, string[]>());
}

async function getInviteTourIds(supabase: SupabaseClient, inviteIds: string[]) {
  if (!inviteIds.length) return new Map<string, string[]>();

  const { data, error } = await supabase
    .from('workspace_invite_tours')
    .select('invite_id, tour_id')
    .in('invite_id', inviteIds);

  if (error) {
    if (isMissingRelationError(error)) return new Map<string, string[]>();
    throw new ApiError(500, error.message);
  }

  return (data ?? []).reduce((map: Map<string, string[]>, row: any) => {
    const inviteId = String(row.invite_id);
    const next = map.get(inviteId) ?? [];
    next.push(String(row.tour_id));
    map.set(inviteId, next);
    return map;
  }, new Map<string, string[]>());
}

async function assertValidScopeProjectIds(supabase: SupabaseClient, workspaceId: string, projectIds: string[]) {
  const uniqueProjectIds = [...new Set(projectIds.map((id) => String(id).trim()).filter(Boolean))];
  if (!uniqueProjectIds.length) {
    throw new ApiError(400, 'At least one projectId is required for project-limited invites.');
  }

  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('workspace_id', workspaceId)
    .in('id', uniqueProjectIds);

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Projects schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  const foundIds = new Set((data ?? []).map((row: any) => String(row.id)));
  const missing = uniqueProjectIds.filter((id) => !foundIds.has(id));
  if (missing.length) {
    throw new ApiError(400, 'One or more selected projects do not belong to this workspace.');
  }

  return uniqueProjectIds;
}

async function assertValidScopeTourIds(supabase: SupabaseClient, workspaceId: string, tourIds: string[]) {
  const uniqueTourIds = [...new Set(tourIds.map((id) => String(id).trim()).filter(Boolean))];
  if (!uniqueTourIds.length) {
    throw new ApiError(400, 'At least one tourId is required for tour-limited invites.');
  }

  const { data, error } = await supabase
    .from('tours')
    .select('id, project_id')
    .eq('workspace_id', workspaceId)
    .in('id', uniqueTourIds);

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Tours schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  const rows = data ?? [];
  const foundIds = new Set(rows.map((row: any) => String(row.id)));
  const missing = uniqueTourIds.filter((id) => !foundIds.has(id));
  if (missing.length) {
    throw new ApiError(400, 'One or more selected tours do not belong to this workspace.');
  }

  const projectIds = [...new Set(rows.map((row: any) => String(row.project_id)).filter(Boolean))];
  return { tourIds: uniqueTourIds, projectIds };
}

export async function listWorkspaceInvitesScoped(supabaseInput: SupabaseClient, userId: string, workspaceId: string) {
  const supabase = requireScopedDataClient(supabaseInput);
  await requireWorkspaceAccess(supabase, userId, workspaceId, ['owner', 'admin']);

  const { data, error } = await supabase
    .from('workspace_invites')
    .select('id, workspace_id, email, role, scope_type, status, invited_by_user_id, accepted_by_user_id, expires_at, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new ApiError(500, error.message);
  }

  const rows = data ?? [];
  const inviteIds = rows.map((row: any) => String(row.id));
  const byInvite = await getInviteProjectIds(supabase, inviteIds);
  const tourByInvite = await getInviteTourIds(supabase, inviteIds);
  return rows.map((row: any) => mapInviteRow(row, byInvite.get(String(row.id)) ?? [], tourByInvite.get(String(row.id)) ?? []));
}

export async function createWorkspaceInviteScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { workspaceId: string; email: string; role: string; scopeType?: string; projectIds?: string[]; tourIds?: string[]; expiresAt?: string | null },
) {
  const supabase = requireScopedDataClient(supabaseInput);
  const workspaceId = String(input.workspaceId ?? '').trim();
  const email = normalizeInviteEmail(input.email);
  let role: WorkspaceInviteRole;
  try {
    role = validateInviteRole(input.role);
  } catch {
    throw new ApiError(400, 'Invite role must be one of: admin, editor, viewer.');
  }

  const scopeType = normalizeScopeType(input.scopeType ?? 'workspace');

  if (!workspaceId) {
    throw new ApiError(400, 'workspaceId is required.');
  }

  if (!email) {
    throw new ApiError(400, 'email is required.');
  }

  await requireWorkspaceAccess(supabase, userId, workspaceId, ['owner', 'admin']);

  const expiresAt = input.expiresAt ? new Date(input.expiresAt).toISOString() : buildInviteExpiry();
  if (!Number.isFinite(new Date(expiresAt).getTime())) {
    throw new ApiError(400, 'expiresAt must be a valid ISO date string.');
  }

  const validatedProjectIds = scopeType === 'projects'
    ? await assertValidScopeProjectIds(supabase, workspaceId, input.projectIds ?? [])
    : [];
  const validatedTours = scopeType === 'tours'
    ? await assertValidScopeTourIds(supabase, workspaceId, input.tourIds ?? [])
    : { tourIds: [], projectIds: [] };
  const projectIds = scopeType === 'tours' ? validatedTours.projectIds : validatedProjectIds;
  const tourIds = validatedTours.tourIds;

  const { data: duplicateRows, error: duplicateError } = await supabase
    .from('workspace_invites')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('email', email)
    .eq('role', role)
    .eq('scope_type', scopeType)
    .eq('status', 'pending');

  if (duplicateError) {
    if (isMissingRelationError(duplicateError)) {
      throw new ApiError(409, 'Workspace invites schema is not ready yet.');
    }
    throw new ApiError(500, duplicateError.message);
  }

  if (scopeType !== 'tours' && (duplicateRows ?? []).length > 0) {
    throw new ApiError(409, 'An active invite already exists for this user, role, and scope.');
  }

  if (scopeType === 'tours' && (duplicateRows ?? []).length > 0) {
    const duplicateIds = (duplicateRows ?? []).map((row: any) => String(row.id));
    const existingTourIds = await getInviteTourIds(supabase, duplicateIds);
    const requestedKey = [...tourIds].sort().join(',');
    const exactDuplicate = duplicateIds.some((inviteId) => [...(existingTourIds.get(inviteId) ?? [])].sort().join(',') === requestedKey);
    if (exactDuplicate) {
      throw new ApiError(409, 'An active invite already exists for this user, role, and tour scope.');
    }
  }

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);

  const { data, error } = await supabase
    .from('workspace_invites')
    .insert({
      workspace_id: workspaceId,
      email,
      role,
      scope_type: scopeType,
      token_hash: tokenHash,
      status: 'pending',
      invited_by_user_id: userId,
      expires_at: expiresAt,
    })
    .select('id, workspace_id, email, role, scope_type, status, invited_by_user_id, accepted_by_user_id, expires_at, created_at, updated_at')
    .single();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Workspace invites schema is not ready yet.');
    }
    if (error.code === '23505') {
      throw new ApiError(409, 'An active invite already exists for this user and role.');
    }
    throw new ApiError(500, error.message);
  }

  if (scopeType === 'projects' && projectIds.length) {
    const grants = projectIds.map((projectId) => ({ invite_id: String(data.id), workspace_id: workspaceId, project_id: projectId }));
    const { error: grantError } = await supabase.from('workspace_invite_projects').insert(grants);
    if (grantError) {
      throw new ApiError(500, grantError.message);
    }
  }

  if (scopeType === 'tours' && tourIds.length) {
    const grants = tourIds.map((tourId) => ({ invite_id: String(data.id), workspace_id: workspaceId, project_id: projectIds[0] ?? null, tour_id: tourId }));
    const { data: toursData, error: toursReadError } = await supabase
      .from('tours')
      .select('id, project_id')
      .eq('workspace_id', workspaceId)
      .in('id', tourIds);
    if (toursReadError) {
      throw new ApiError(500, toursReadError.message);
    }
    const projectByTour = new Map((toursData ?? []).map((row: any) => [String(row.id), String(row.project_id)]));
    const grantRows = tourIds.map((tourId) => ({
      invite_id: String(data.id),
      workspace_id: workspaceId,
      project_id: projectByTour.get(tourId) ?? projectIds[0],
      tour_id: tourId,
    }));
    const { error: grantError } = await supabase.from('workspace_invite_tours').insert(grantRows);
    if (grantError) {
      throw new ApiError(500, grantError.message);
    }
  }

  return {
    invite: mapInviteRow(data, projectIds, tourIds),
    token,
  };
}

export async function revokeWorkspaceInviteScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { workspaceId: string; inviteId: string },
) {
  const supabase = requireScopedDataClient(supabaseInput);
  const workspaceId = String(input.workspaceId ?? '').trim();
  const inviteId = String(input.inviteId ?? '').trim();

  if (!workspaceId) throw new ApiError(400, 'workspaceId is required.');
  if (!inviteId) throw new ApiError(400, 'inviteId is required.');

  await requireWorkspaceAccess(supabase, userId, workspaceId, ['owner', 'admin']);

  const { data: existing, error: existingError } = await supabase
    .from('workspace_invites')
    .select('id, workspace_id, status')
    .eq('id', inviteId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (existingError) {
    if (isMissingRelationError(existingError)) {
      throw new ApiError(409, 'Workspace invites schema is not ready yet.');
    }
    throw new ApiError(500, existingError.message);
  }

  if (!existing) {
    throw new ApiError(404, 'Invite not found.');
  }

  const existingStatus = String(existing.status);
  if (existingStatus === 'accepted') {
    throw new ApiError(409, 'Accepted invites cannot be revoked.');
  }

  const { data, error } = await supabase
    .from('workspace_invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
    .eq('workspace_id', workspaceId)
    .select('id, workspace_id, email, role, scope_type, status, invited_by_user_id, accepted_by_user_id, expires_at, created_at, updated_at')
    .single();

  if (error) {
    throw new ApiError(500, error.message);
  }

  const byInvite = await getInviteProjectIds(supabase, [inviteId]);
  const tourByInvite = await getInviteTourIds(supabase, [inviteId]);
  return mapInviteRow(data, byInvite.get(inviteId) ?? [], tourByInvite.get(inviteId) ?? []);
}

export async function getProjectNamesForInviteScope(workspaceId: string, projectIds: string[]) {
  if (!projectIds.length) return [];
  const supabase = getPrivilegedDataClient();
  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .in('id', projectIds);

  if (error) return [];

  const names = new Map((data ?? []).map((row: any) => [String(row.id), String(row.name ?? '')]));
  return projectIds.map((id) => names.get(id) ?? id);
}

export async function acceptWorkspaceInvitePrivileged(input: {
  userId: string;
  userEmail: string | null;
  token: string;
}) {
  const userId = String(input.userId ?? '').trim();
  const token = String(input.token ?? '').trim();
  const userEmail = normalizeInviteEmail(input.userEmail);

  if (!userId) throw new ApiError(401, 'Unauthorized');
  if (!userEmail) throw new ApiError(400, 'Your account must have an email address to accept invites.');
  if (!token) throw new ApiError(400, 'token is required.');

  const supabase = getPrivilegedDataClient();
  const tokenHash = hashInviteToken(token);

  const { data: inviteRow, error: inviteError } = await supabase
    .from('workspace_invites')
    .select('id, workspace_id, email, role, scope_type, status, invited_by_user_id, accepted_by_user_id, expires_at, created_at, updated_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (inviteError) {
    if (isMissingRelationError(inviteError)) {
      throw new ApiError(409, 'Workspace invites schema is not ready yet.');
    }
    throw new ApiError(500, inviteError.message);
  }

  if (!inviteRow) {
    throw new ApiError(404, 'Invite token is invalid.');
  }

  const scopeType = normalizeScopeType(inviteRow.scope_type);
  const inviteId = String(inviteRow.id);
  const inviteProjectIdsByInvite = await getInviteProjectIds(supabase, [inviteId]);
  const inviteTourIdsByInvite = await getInviteTourIds(supabase, [inviteId]);
  const inviteProjectIds = inviteProjectIdsByInvite.get(inviteId) ?? [];
  const inviteTourIds = inviteTourIdsByInvite.get(inviteId) ?? [];
  if (scopeType === 'projects' && !inviteProjectIds.length) {
    throw new ApiError(409, 'Invite scope is invalid: no projects assigned.');
  }
  if (scopeType === 'tours' && !inviteTourIds.length) {
    throw new ApiError(409, 'Invite scope is invalid: no tours assigned.');
  }

  const invite = mapInviteRow(inviteRow, inviteProjectIds, inviteTourIds);
  if (invite.status === 'revoked') {
    throw new ApiError(409, 'Invite has been revoked.');
  }
  if (invite.status === 'accepted') {
    throw new ApiError(409, 'Invite has already been accepted.');
  }
  if (invite.status === 'expired') {
    await supabase.from('workspace_invites').update({ status: 'expired' }).eq('id', invite.id);
    throw new ApiError(410, 'Invite has expired.');
  }

  if (normalizeInviteEmail(invite.email) !== userEmail) {
    throw new ApiError(403, 'Invite email does not match your authenticated account.');
  }

  const { data: existingMember, error: existingMemberError } = await supabase
    .from('workspace_members')
    .select('id, role, scope_type')
    .eq('workspace_id', invite.workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMemberError) {
    throw new ApiError(500, existingMemberError.message);
  }

  let membershipCreated = false;
  let workspaceMemberId = existingMember?.id ? String(existingMember.id) : '';

  if (!existingMember) {
    const { data: insertedMember, error: insertMemberError } = await supabase.from('workspace_members').insert({
      workspace_id: invite.workspaceId,
      user_id: userId,
      role: invite.role,
      scope_type: scopeType,
    }).select('id').single();

    if (insertMemberError) {
      if (insertMemberError.code !== '23505') {
        throw new ApiError(500, insertMemberError.message);
      }
    } else {
      membershipCreated = true;
      workspaceMemberId = String(insertedMember.id);
    }
  }

  if (!workspaceMemberId) {
    const { data: refreshedMember, error: refreshedMemberError } = await supabase
      .from('workspace_members')
      .select('id, scope_type')
      .eq('workspace_id', invite.workspaceId)
      .eq('user_id', userId)
      .single();

    if (refreshedMemberError) throw new ApiError(500, refreshedMemberError.message);
    workspaceMemberId = String(refreshedMember.id);
  }

  const { data: currentMember, error: currentMemberError } = await supabase
    .from('workspace_members')
    .select('scope_type')
    .eq('id', workspaceMemberId)
    .single();

  if (currentMemberError) throw new ApiError(500, currentMemberError.message);

  const currentScope = normalizeScopeType(currentMember.scope_type);
  const precedence = { tours: 1, projects: 2, workspace: 3 } as const;
  const nextScope = precedence[scopeType] > precedence[currentScope] ? scopeType : currentScope;

  if (nextScope !== currentScope) {
    const { error: widenError } = await supabase
      .from('workspace_members')
      .update({ scope_type: nextScope })
      .eq('id', workspaceMemberId);
    if (widenError) throw new ApiError(500, widenError.message);
  }

  if (nextScope === 'workspace') {
    const { error: clearProjectGrantsError } = await supabase
      .from('workspace_member_projects')
      .delete()
      .eq('workspace_member_id', workspaceMemberId);
    if (clearProjectGrantsError && !isMissingRelationError(clearProjectGrantsError)) {
      throw new ApiError(500, clearProjectGrantsError.message);
    }

    const { error: clearTourGrantsError } = await supabase
      .from('workspace_member_tours')
      .delete()
      .eq('workspace_member_id', workspaceMemberId);
    if (clearTourGrantsError && !isMissingRelationError(clearTourGrantsError)) {
      throw new ApiError(500, clearTourGrantsError.message);
    }
  }

  if (scopeType === 'projects' && inviteProjectIds.length && nextScope === 'projects') {
    const { error: clearTourGrantsError } = await supabase
      .from('workspace_member_tours')
      .delete()
      .eq('workspace_member_id', workspaceMemberId);
    if (clearTourGrantsError && !isMissingRelationError(clearTourGrantsError)) {
      throw new ApiError(500, clearTourGrantsError.message);
    }

    const grantRows = inviteProjectIds.map((projectId) => ({
      workspace_member_id: workspaceMemberId,
      workspace_id: invite.workspaceId,
      project_id: projectId,
    }));
    const { error: grantInsertError } = await supabase.from('workspace_member_projects').upsert(grantRows, { onConflict: 'workspace_member_id,project_id' });
    if (grantInsertError) throw new ApiError(500, grantInsertError.message);
  }

  if (scopeType === 'tours' && inviteTourIds.length && nextScope === 'tours') {
    const { data: toursData, error: toursReadError } = await supabase
      .from('tours')
      .select('id, project_id')
      .eq('workspace_id', invite.workspaceId)
      .in('id', inviteTourIds);
    if (toursReadError) throw new ApiError(500, toursReadError.message);

    const grantRows = (toursData ?? []).map((row: any) => ({
      workspace_member_id: workspaceMemberId,
      workspace_id: invite.workspaceId,
      project_id: String(row.project_id),
      tour_id: String(row.id),
    }));
    const { error: grantInsertError } = await supabase.from('workspace_member_tours').upsert(grantRows, { onConflict: 'workspace_member_id,tour_id' });
    if (grantInsertError) throw new ApiError(500, grantInsertError.message);
  }

  const { data: acceptedRow, error: acceptedError } = await supabase
    .from('workspace_invites')
    .update({
      status: 'accepted',
      accepted_by_user_id: userId,
    })
    .eq('id', invite.id)
    .eq('status', 'pending')
    .select('id, workspace_id, email, role, scope_type, status, invited_by_user_id, accepted_by_user_id, expires_at, created_at, updated_at')
    .maybeSingle();

  if (acceptedError) {
    throw new ApiError(500, acceptedError.message);
  }

  if (!acceptedRow) {
    throw new ApiError(409, 'Invite is no longer pending.');
  }

  return {
    invite: mapInviteRow(acceptedRow, inviteProjectIds, inviteTourIds),
    membershipCreated,
  };
}
