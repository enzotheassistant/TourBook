import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, getPrivilegedDataClient, isMissingRelationError, requireScopedDataClient, requireWorkspaceAccess } from '@/lib/data/server/shared';
import { buildInviteExpiry, generateInviteToken, hashInviteToken, normalizeInviteEmail, validateInviteRole, type WorkspaceInviteRole } from '@/lib/invites/security';

export type WorkspaceInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export type WorkspaceInviteSummary = {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceInviteRole;
  status: WorkspaceInviteStatus;
  invitedByUserId: string;
  acceptedByUserId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};


function mapInviteRow(row: any): WorkspaceInviteSummary {
  const now = Date.now();
  const expiresAtMs = new Date(String(row.expires_at)).getTime();
  const status = String(row.status) as WorkspaceInviteStatus;
  const computedStatus: WorkspaceInviteStatus = status === 'pending' && Number.isFinite(expiresAtMs) && expiresAtMs <= now ? 'expired' : status;

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    email: String(row.email),
    role: String(row.role) as WorkspaceInviteRole,
    status: computedStatus,
    invitedByUserId: String(row.invited_by_user_id),
    acceptedByUserId: row.accepted_by_user_id ? String(row.accepted_by_user_id) : null,
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listWorkspaceInvitesScoped(supabaseInput: SupabaseClient, userId: string, workspaceId: string) {
  const supabase = requireScopedDataClient(supabaseInput);
  await requireWorkspaceAccess(supabase, userId, workspaceId, ['owner', 'admin']);

  const { data, error } = await supabase
    .from('workspace_invites')
    .select('id, workspace_id, email, role, status, invited_by_user_id, accepted_by_user_id, expires_at, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new ApiError(500, error.message);
  }

  return (data ?? []).map(mapInviteRow);
}

export async function createWorkspaceInviteScoped(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { workspaceId: string; email: string; role: string; expiresAt?: string | null },
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

  const { data: duplicate, error: duplicateError } = await supabase
    .from('workspace_invites')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('email', email)
    .eq('role', role)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();

  if (duplicateError) {
    if (isMissingRelationError(duplicateError)) {
      throw new ApiError(409, 'Workspace invites schema is not ready yet.');
    }
    throw new ApiError(500, duplicateError.message);
  }

  if (duplicate) {
    throw new ApiError(409, 'An active invite already exists for this user and role.');
  }

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);

  const { data, error } = await supabase
    .from('workspace_invites')
    .insert({
      workspace_id: workspaceId,
      email,
      role,
      token_hash: tokenHash,
      status: 'pending',
      invited_by_user_id: userId,
      expires_at: expiresAt,
    })
    .select('id, workspace_id, email, role, status, invited_by_user_id, accepted_by_user_id, expires_at, created_at, updated_at')
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

  return {
    invite: mapInviteRow(data),
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
    .select('id, workspace_id, email, role, status, invited_by_user_id, accepted_by_user_id, expires_at, created_at, updated_at')
    .single();

  if (error) {
    throw new ApiError(500, error.message);
  }

  return mapInviteRow(data);
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
    .select('id, workspace_id, email, role, status, invited_by_user_id, accepted_by_user_id, expires_at, created_at, updated_at')
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

  const invite = mapInviteRow(inviteRow);
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
    .select('id, role')
    .eq('workspace_id', invite.workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMemberError) {
    throw new ApiError(500, existingMemberError.message);
  }

  let membershipCreated = false;

  if (!existingMember) {
    const { error: insertMemberError } = await supabase.from('workspace_members').insert({
      workspace_id: invite.workspaceId,
      user_id: userId,
      role: invite.role,
    });

    if (insertMemberError) {
      if (insertMemberError.code !== '23505') {
        throw new ApiError(500, insertMemberError.message);
      }
    } else {
      membershipCreated = true;
    }
  }

  const { data: acceptedRow, error: acceptedError } = await supabase
    .from('workspace_invites')
    .update({
      status: 'accepted',
      accepted_by_user_id: userId,
    })
    .eq('id', invite.id)
    .eq('status', 'pending')
    .select('id, workspace_id, email, role, status, invited_by_user_id, accepted_by_user_id, expires_at, created_at, updated_at')
    .maybeSingle();

  if (acceptedError) {
    throw new ApiError(500, acceptedError.message);
  }

  if (!acceptedRow) {
    throw new ApiError(409, 'Invite is no longer pending.');
  }

  return {
    invite: mapInviteRow(acceptedRow),
    membershipCreated,
  };
}
