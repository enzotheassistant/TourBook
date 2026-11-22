import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, getPrivilegedDataClient, isMissingRelationError, requireScopedDataClient, requireWorkspaceAccess } from '@/lib/data/server/shared';
import { buildInviteExpiry, generateInviteToken, hashInviteToken, normalizeInviteEmail, validateInviteRole, type WorkspaceInviteRole } from '@/lib/invites/security';
import type { WorkspaceScopeType } from '@/lib/types/tenant';
import { canGrantBandEntry, canManageWholeAccess, hasFullWorkspaceControl } from '@/lib/data/server/manager-scope';
import { highestRole, mergeAccess, normalizeEntries, toStoredAccess, type BandAccess, type BandRole } from '@/lib/access/band-access';
import { readManyInviteBandAccess, readMemberBandAccess, validateAccessInWorkspace, writeInviteBandRows, writeMemberBandAccess } from '@/lib/data/server/member-access-store';
import { normalizeScopeTypeValue } from '@/lib/data/server/invite-scope-utils';
import { grantsMembershipOnAccept, resolveInviteAcceptOutcome } from '@/lib/data/server/invite-accept-utils';

export type WorkspaceInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export type WorkspaceInviteSummary = {
  id: string;
  workspaceId: string;
  name: string | null;
  email: string;
  role: WorkspaceInviteRole;
  scopeType: WorkspaceScopeType;
  projectIds: string[];
  tourIds: string[];
  status: WorkspaceInviteStatus;
  invitedByUserId: string;
  acceptedByUserId: string | null;
  /** Per-band access the invite gives. */
  access?: BandAccess;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

const INVITE_COLUMNS = 'id, workspace_id, invitee_name, email, role, scope_type, status, invited_by_user_id, accepted_by_user_id, expires_at, created_at, updated_at';

export function normalizeScopeType(value: unknown): WorkspaceScopeType {
  const normalized = normalizeScopeTypeValue(value);
  if (normalized) return normalized;
  throw new ApiError(400, 'scopeType must be workspace, projects, or tours.');
}

/**
 * Owners (and the retired admin level) manage every invite with their own
 * signed-in database access. Managers ('editor') can manage invites only for
 * the projects/tours they have; the app checks that here, then uses the
 * server's own access for the database work (same pattern as Team members).
 */
async function requireInviteManagerAccess(supabase: SupabaseClient, userId: string, workspaceId: string) {
  const access = await requireWorkspaceAccess(supabase, userId, workspaceId, ['owner', 'admin', 'editor']);
  const fullControl = hasFullWorkspaceControl(access.role);
  return { access, fullControl, client: fullControl ? supabase : getPrivilegedDataClient() };
}

/** Managers can only see and act on invites whose bands they manage. */
function inviteWithinManagerScope(
  manager: Awaited<ReturnType<typeof requireInviteManagerAccess>>,
  access: BandAccess | undefined,
) {
  if (manager.fullControl) return true;
  return !!access && canManageWholeAccess(manager.access.bandAccess, access);
}

/** The access an invite should give, from the request (per-band form, or the older single-level form). */
function desiredInviteAccess(input: { access?: unknown; role?: string; scopeType?: string; projectIds?: string[]; tourIds?: string[] }, tourProjectById: Map<string, string>): BandAccess {
  const raw = input.access as { allProjects?: unknown; role?: unknown; entries?: unknown } | undefined;
  if (raw && typeof raw === 'object') {
    if (raw.allProjects === true) {
      try {
        return { allProjects: true, role: validateInviteRole(String(raw.role ?? '')) as BandRole, entries: [] };
      } catch {
        throw new ApiError(400, 'Choose Viewer, Crew or Manager for this invite.');
      }
    }
    const entries = normalizeEntries(Array.isArray(raw.entries) ? raw.entries : []).filter((entry) => entry.role !== 'admin');
    if (!entries.length) throw new ApiError(400, 'Choose at least one project for this invite.');
    return { allProjects: false, role: highestRole(entries.map((entry) => entry.role)), entries };
  }

  let role: BandRole;
  try {
    role = validateInviteRole(input.role) as BandRole;
  } catch {
    throw new ApiError(400, 'Choose Viewer, Crew or Manager for this invite.');
  }
  const scopeType = normalizeScopeType(input.scopeType ?? 'workspace');
  if (scopeType === 'workspace') return { allProjects: true, role, entries: [] };
  if (scopeType === 'projects') {
    const ids = [...new Set((input.projectIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
    if (!ids.length) throw new ApiError(400, 'At least one projectId is required for project-limited invites.');
    return { allProjects: false, role, entries: ids.map((projectId) => ({ projectId, role, tourIds: [] })) };
  }
  const byProject = new Map<string, string[]>();
  for (const tourId of input.tourIds ?? []) {
    const projectId = tourProjectById.get(String(tourId));
    if (!projectId) throw new ApiError(400, 'One or more selected tours do not belong to this workspace.');
    byProject.set(projectId, [...new Set([...(byProject.get(projectId) ?? []), String(tourId)])]);
  }
  if (!byProject.size) throw new ApiError(400, 'At least one tourId is required for tour-limited invites.');
  return { allProjects: false, role, entries: [...byProject.entries()].map(([projectId, tourIds]) => ({ projectId, role, tourIds })) };
}

function mapInviteRow(row: any, projectIds: string[] = [], tourIds: string[] = [], access?: BandAccess): WorkspaceInviteSummary {
  const now = Date.now();
  const expiresAtMs = new Date(String(row.expires_at)).getTime();
  const status = String(row.status) as WorkspaceInviteStatus;
  const computedStatus: WorkspaceInviteStatus = status === 'pending' && Number.isFinite(expiresAtMs) && expiresAtMs <= now ? 'expired' : status;

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: row.invitee_name ? String(row.invitee_name) : null,
    email: String(row.email),
    role: String(row.role) as WorkspaceInviteRole,
    scopeType: normalizeScopeType(row.scope_type),
    projectIds,
    tourIds,
    status: computedStatus,
    invitedByUserId: String(row.invited_by_user_id),
    access,
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

export async function listWorkspaceInvitesScoped(supabaseInput: SupabaseClient, userId: string, workspaceId: string) {
  const manager = await requireInviteManagerAccess(requireScopedDataClient(supabaseInput), userId, workspaceId);
  const supabase = manager.client;

  const { data, error } = await supabase
    .from('workspace_invites')
    .select(INVITE_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new ApiError(500, error.message);
  }

  const rows = data ?? [];
  const accessByInvite = await readManyInviteBandAccess(supabase, rows as any[]);
  const mapped = rows
    .map((row: any) => {
      const access = accessByInvite.get(String(row.id));
      const projectIds = access && !access.allProjects ? access.entries.map((entry) => entry.projectId) : [];
      const tourIds = access && !access.allProjects ? [...new Set(access.entries.flatMap((entry) => entry.tourIds))] : [];
      return mapInviteRow(row, projectIds, tourIds, access);
    })
    .filter((invite) => inviteWithinManagerScope(manager, invite.access));

  // Write-back expired status for any invites that are logically expired but still 'pending' in the DB.
  // This keeps the DB consistent so duplicate-creation checks (which filter by status) remain accurate.
  const expiredIds = mapped
    .filter((invite) => invite.status === 'expired')
    .map((invite) => invite.id);
  if (expiredIds.length) {
    // Best-effort: ignore errors so a failed write-back doesn't break the list endpoint.
    await supabase
      .from('workspace_invites')
      .update({ status: 'expired' })
      .in('id', expiredIds)
      .eq('status', 'pending');
  }

  return mapped;
}

export async function createWorkspaceInviteScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { workspaceId: string; name?: string | null; email: string; access?: unknown; role?: string; scopeType?: string; projectIds?: string[]; tourIds?: string[]; expiresAt?: string | null },
) {
  const supabase = requireScopedDataClient(supabaseInput);
  const workspaceId = String(input.workspaceId ?? '').trim();
  const name = String(input.name ?? '').trim() || null;
  const email = normalizeInviteEmail(input.email);

  if (!workspaceId) {
    throw new ApiError(400, 'workspaceId is required.');
  }

  if (!email) {
    throw new ApiError(400, 'email is required.');
  }

  const manager = await requireInviteManagerAccess(supabase, userId, workspaceId);
  const db = manager.client;

  const expiresAt = input.expiresAt ? new Date(input.expiresAt).toISOString() : buildInviteExpiry();
  if (!Number.isFinite(new Date(expiresAt).getTime())) {
    throw new ApiError(400, 'expiresAt must be a valid ISO date string.');
  }

  // Older single-level form with tours: look up each tour's band.
  const tourProjectById = new Map<string, string>();
  if (!input.access && (input.tourIds ?? []).length) {
    const { data: tours } = await db.from('tours').select('id, project_id').eq('workspace_id', workspaceId).in('id', input.tourIds ?? []);
    for (const row of tours ?? []) tourProjectById.set(String((row as any).id), String((row as any).project_id));
  }

  const access = await validateAccessInWorkspace(db, workspaceId, desiredInviteAccess(input, tourProjectById));

  // Managers: only bands (and tours) they manage, never above Manager.
  if (!manager.fullControl) {
    const allowed = access.allProjects
      ? manager.access.bandAccess.allProjects && ['owner', 'admin', 'editor'].includes(manager.access.bandAccess.role)
      : access.entries.every((entry) => canGrantBandEntry(manager.access.bandAccess, entry));
    if (!allowed) {
      throw new ApiError(403, 'You can only invite people to projects you manage.');
    }
  }

  const { data: duplicateRows, error: duplicateError } = await db
    .from('workspace_invites')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('email', email)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString());

  if (duplicateError) {
    if (isMissingRelationError(duplicateError)) {
      throw new ApiError(409, 'Workspace invites schema is not ready yet.');
    }
    throw new ApiError(500, duplicateError.message);
  }

  if ((duplicateRows ?? []).length > 0) {
    throw new ApiError(409, 'This email already has a pending invite. Resend or revoke it first.');
  }

  const stored = toStoredAccess(access);
  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);

  const { data, error } = await db
    .from('workspace_invites')
    .insert({
      workspace_id: workspaceId,
      invitee_name: name,
      email,
      role: stored.role,
      scope_type: stored.scopeType,
      token_hash: tokenHash,
      status: 'pending',
      invited_by_user_id: userId,
      expires_at: expiresAt,
    })
    .select(INVITE_COLUMNS)
    .single();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Workspace invites schema is not ready yet.');
    }
    if (error.code === '23505') {
      throw new ApiError(409, 'This email already has a pending invite. Resend or revoke it first.');
    }
    throw new ApiError(500, error.message);
  }

  await writeInviteBandRows(db, workspaceId, String(data.id), access);

  const projectIds = access.allProjects ? [] : access.entries.map((entry) => entry.projectId);
  const tourIds = access.allProjects ? [] : [...new Set(access.entries.flatMap((entry) => entry.tourIds))];
  return {
    invite: mapInviteRow(data, projectIds, tourIds, access),
    token,
  };
}

export async function revokeWorkspaceInviteScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { workspaceId: string; inviteId: string },
) {
  const scoped = requireScopedDataClient(supabaseInput);
  const workspaceId = String(input.workspaceId ?? '').trim();
  const inviteId = String(input.inviteId ?? '').trim();

  if (!workspaceId) throw new ApiError(400, 'workspaceId is required.');
  if (!inviteId) throw new ApiError(400, 'inviteId is required.');

  const manager = await requireInviteManagerAccess(scoped, userId, workspaceId);
  const supabase = manager.client;

  const { data: existing, error: existingError } = await supabase
    .from('workspace_invites')
    .select('id, workspace_id, status, scope_type, role')
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

  if (!manager.fullControl) {
    const accessByInvite = await readManyInviteBandAccess(supabase, [existing as any]);
    if (!inviteWithinManagerScope(manager, accessByInvite.get(inviteId))) {
      throw new ApiError(404, 'Invite not found.');
    }
  }

  const existingStatus = String(existing.status);
  if (existingStatus === 'accepted') {
    throw new ApiError(409, 'Accepted invites cannot be revoked.');
  }

  // Guard the write itself, not just the read above: only flip status if it
  // is still 'pending' at the moment of the update. Without this guard, an
  // accept that wins the pending -> accepted race between our read and our
  // write would get silently overwritten back to 'revoked' here, even though
  // that user already has real membership access.
  const { data, error } = await supabase
    .from('workspace_invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .select(INVITE_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message);
  }

  if (!data) {
    const { data: currentRow, error: currentError } = await supabase
      .from('workspace_invites')
      .select(INVITE_COLUMNS)
      .eq('id', inviteId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (currentError) {
      throw new ApiError(500, currentError.message);
    }

    if (currentRow && String(currentRow.status) === 'accepted') {
      throw new ApiError(409, 'Accepted invites cannot be revoked.');
    }

    throw new ApiError(409, 'Invite is no longer pending.');
  }

  const byInvite = await getInviteProjectIds(supabase, [inviteId]);
  const tourByInvite = await getInviteTourIds(supabase, [inviteId]);
  const accessForInvite = (await readManyInviteBandAccess(supabase, [data as any])).get(inviteId);
  return mapInviteRow(data, byInvite.get(inviteId) ?? [], tourByInvite.get(inviteId) ?? [], accessForInvite);
}

export async function resendWorkspaceInviteScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { workspaceId: string; inviteId: string },
): Promise<{ invite: WorkspaceInviteSummary; token: string }> {
  const scoped = requireScopedDataClient(supabaseInput);
  const workspaceId = String(input.workspaceId ?? '').trim();
  const inviteId = String(input.inviteId ?? '').trim();

  if (!workspaceId) throw new ApiError(400, 'workspaceId is required.');
  if (!inviteId) throw new ApiError(400, 'inviteId is required.');

  const manager = await requireInviteManagerAccess(scoped, userId, workspaceId);
  const supabase = manager.client;

  const { data: existing, error: existingError } = await supabase
    .from('workspace_invites')
    .select('id, workspace_id, status, scope_type, role')
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

  if (!manager.fullControl) {
    const accessByInvite = await readManyInviteBandAccess(supabase, [existing as any]);
    if (!inviteWithinManagerScope(manager, accessByInvite.get(inviteId))) {
      throw new ApiError(404, 'Invite not found.');
    }
  }

  const existingStatus = String(existing.status);
  if (existingStatus !== 'pending') {
    throw new ApiError(409, 'Only pending invites can be resent.');
  }

  // Regenerate token and extend expiry
  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = buildInviteExpiry();

  const { data, error } = await supabase
    .from('workspace_invites')
    .update({ token_hash: tokenHash, expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq('id', inviteId)
    .eq('workspace_id', workspaceId)
    .select(INVITE_COLUMNS)
    .single();

  if (error) {
    throw new ApiError(500, error.message);
  }

  const byInvite = await getInviteProjectIds(supabase, [inviteId]);
  const tourByInvite = await getInviteTourIds(supabase, [inviteId]);
  const accessForInvite = (await readManyInviteBandAccess(supabase, [data as any])).get(inviteId);
  const invite = mapInviteRow(data, byInvite.get(inviteId) ?? [], tourByInvite.get(inviteId) ?? [], accessForInvite);

  return { invite, token };
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

/**
 * Give the accepted invite's access. If the person is already on the team,
 * combine it with what they have — never lowering anything (higher level wins,
 * whole band beats some tours).
 */
async function reconcileAcceptedWorkspaceInvite(input: {
  supabase: SupabaseClient;
  invite: WorkspaceInviteSummary;
  granted: BandAccess;
  userId: string;
}) {
  const { supabase, invite, granted, userId } = input;

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
  const stored = toStoredAccess(granted);

  if (!existingMember) {
    const { data: insertedMember, error: insertMemberError } = await supabase.from('workspace_members').insert({
      workspace_id: invite.workspaceId,
      user_id: userId,
      role: stored.role,
      scope_type: stored.scopeType,
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

  const { data: currentMember, error: currentMemberError } = await supabase
    .from('workspace_members')
    .select('id, role, scope_type')
    .eq('workspace_id', invite.workspaceId)
    .eq('user_id', userId)
    .single();
  if (currentMemberError) throw new ApiError(500, currentMemberError.message);
  workspaceMemberId = String(currentMember.id);

  // The owner already has everything.
  if (String(currentMember.role) === 'owner') return { membershipCreated };

  const current = membershipCreated ? null : await readMemberBandAccess(supabase, currentMember as any);
  const next = mergeAccess(current, granted);
  await writeMemberBandAccess(supabase, invite.workspaceId, workspaceMemberId, next);

  return { membershipCreated };
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
    .select(INVITE_COLUMNS)
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

  const inviteId = String(inviteRow.id);
  const granted = (await readManyInviteBandAccess(supabase, [inviteRow as any])).get(inviteId);
  if (!granted || (!granted.allProjects && !granted.entries.length)) {
    throw new ApiError(409, 'Invite scope is invalid: no projects assigned.');
  }
  const inviteProjectIds = granted.allProjects ? [] : granted.entries.map((entry) => entry.projectId);
  const inviteTourIds = granted.allProjects ? [] : [...new Set(granted.entries.flatMap((entry) => entry.tourIds))];

  const invite = mapInviteRow(inviteRow, inviteProjectIds, inviteTourIds);

  // Fast-path rejection from the snapshot we just read. This is purely an
  // early exit for the common (non-racing) case — it is NOT what makes this
  // function safe under concurrency. The guarded UPDATE below is the only
  // check that decides whether membership actually gets granted.
  if (invite.status === 'revoked') {
    throw new ApiError(409, 'Invite has been revoked.');
  }
  if (invite.status === 'expired') {
    await supabase.from('workspace_invites').update({ status: 'expired' }).eq('id', invite.id);
    throw new ApiError(410, 'Invite has expired.');
  }

  if (normalizeInviteEmail(invite.email) !== userEmail) {
    throw new ApiError(403, 'Invite email does not match your authenticated account.');
  }

  // Atomically claim the pending -> accepted transition BEFORE granting any
  // membership or scope access. `UPDATE ... WHERE status = 'pending'` is a
  // single statement, so Postgres row-locking guarantees only one writer
  // (this accept, a concurrent duplicate accept, or a concurrent revoke) can
  // win it. If a revoke wins the race, this matches zero rows and we never
  // reach reconcileAcceptedWorkspaceInvite — no membership is ever created
  // for an invite that ends up revoked.
  const { data: claimedRow, error: claimError } = await supabase
    .from('workspace_invites')
    .update({ status: 'accepted', accepted_by_user_id: userId })
    .eq('id', invite.id)
    .eq('status', 'pending')
    .select(INVITE_COLUMNS)
    .maybeSingle();

  if (claimError) {
    throw new ApiError(500, claimError.message);
  }

  let currentInvite: WorkspaceInviteSummary;

  if (claimedRow) {
    currentInvite = mapInviteRow(claimedRow, inviteProjectIds, inviteTourIds);
  } else {
    // We lost the race for the pending -> accepted transition. Re-read the
    // current row (never trust the stale snapshot from above) to find out why.
    const { data: currentRow, error: currentError } = await supabase
      .from('workspace_invites')
      .select(INVITE_COLUMNS)
      .eq('id', invite.id)
      .maybeSingle();

    if (currentError) {
      throw new ApiError(500, currentError.message);
    }

    currentInvite = currentRow ? mapInviteRow(currentRow, inviteProjectIds, inviteTourIds) : invite;
  }

  // Single source of truth for "is granting membership safe right now?" —
  // see lib/data/server/invite-accept-utils.ts and its tests for the full
  // decision table, including the revoked-wins-the-race case this exists to
  // prevent.
  const decision = resolveInviteAcceptOutcome({
    claimed: Boolean(claimedRow),
    currentStatus: currentInvite.status,
    currentAcceptedByUserId: currentInvite.acceptedByUserId,
    userId,
  });

  if (!grantsMembershipOnAccept(decision)) {
    if (decision.kind === 'revoked') throw new ApiError(409, 'Invite has been revoked.');
    if (decision.kind === 'expired') throw new ApiError(410, 'Invite has expired.');
    if (decision.kind === 'accepted-by-other') throw new ApiError(409, 'Invite has already been accepted by a different account.');
    throw new ApiError(409, 'Invite is no longer pending.');
  }

  const { membershipCreated } = await reconcileAcceptedWorkspaceInvite({
    supabase,
    invite: currentInvite,
    granted,
    userId,
  });

  return { invite: currentInvite, membershipCreated };
}

/** Band names with levels for the invite email, e.g. Texas King (Crew), Test Band (Manager). */
export async function getInviteBandsForEmail(workspaceId: string, invite: WorkspaceInviteSummary) {
  const access = invite.access;
  if (!access || access.allProjects || !access.entries.length) return [];
  const names = await getProjectNamesForInviteScope(workspaceId, access.entries.map((entry) => entry.projectId));
  return access.entries.map((entry, index) => ({
    name: names[index] ?? '',
    role: entry.role as WorkspaceInviteRole,
  }));
}
