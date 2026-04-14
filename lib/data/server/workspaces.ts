import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingRelationError, requireWorkspaceAccess, requireScopedDataClient } from '@/lib/data/server/shared';
import type { WorkspaceMemberSummary, WorkspaceSummary } from '@/lib/types/tenant';

export async function listWorkspaceMembershipsForUser(
  supabaseInput: SupabaseClient,
  userId: string,
): Promise<WorkspaceMemberSummary[]> {
  const supabase = requireScopedDataClient(supabaseInput);
  const { data, error } = await supabase
    .from('workspace_members')
    .select('id, workspace_id, user_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    userId: String(row.user_id),
    role: row.role,
  }));
}

export async function listWorkspacesForUser(supabaseInput: SupabaseClient, userId: string): Promise<WorkspaceSummary[]> {
  const supabase = requireScopedDataClient(supabaseInput);
  const memberships = await listWorkspaceMembershipsForUser(supabase, userId);
  if (!memberships.length) return [];

  const workspaceIds = [...new Set(memberships.map((membership) => membership.workspaceId))];
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, slug, owner_user_id, created_at')
    .in('id', workspaceIds)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
  }));
}

export async function canUserAccessWorkspace(supabaseInput: SupabaseClient, userId: string, workspaceId: string) {
  const supabase = requireScopedDataClient(supabaseInput);
  await requireWorkspaceAccess(supabase, userId, workspaceId);
  return true;
}
