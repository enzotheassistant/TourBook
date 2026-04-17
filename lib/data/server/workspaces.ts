import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, isMissingRelationError, requireScopedDataClient, requireWorkspaceAccess } from '@/lib/data/server/shared';
import type { WorkspaceMemberSummary, WorkspaceSummary } from '@/lib/types/tenant';

function normalizeScopeType(value: unknown): 'workspace' | 'projects' {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || raw === 'workspace') return 'workspace';
  if (raw === 'projects') return 'projects';
  return 'projects';
}

function normalizeWorkspaceName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function slugifyWorkspaceName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

async function resolveAvailableWorkspaceSlug(supabase: SupabaseClient, baseSlug: string) {
  const seed = baseSlug || 'workspace';

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? seed : `${seed}-${attempt + 1}`;
    const { data, error } = await supabase
      .from('workspaces')
      .select('id')
      .eq('slug', candidate)
      .limit(1);

    if (error) {
      if (isMissingRelationError(error)) {
        throw new ApiError(409, 'Workspaces schema is not ready yet.');
      }
      throw new ApiError(500, error.message);
    }

    if (!data?.length) return candidate;
  }

  throw new ApiError(409, 'Unable to allocate workspace slug. Try another workspace name.');
}

export async function listWorkspaceMembershipsForUser(
  supabaseInput: SupabaseClient,
  userId: string,
): Promise<WorkspaceMemberSummary[]> {
  const supabase = requireScopedDataClient(supabaseInput);
  const { data, error } = await supabase
    .from('workspace_members')
    .select('id, workspace_id, user_id, role, scope_type')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const memberIds = rows.map((row: any) => String(row.id));
  const projectMap = new Map<string, string[]>();

  if (memberIds.length) {
    const { data: grants, error: grantsError } = await supabase
      .from('workspace_member_projects')
      .select('workspace_member_id, project_id')
      .in('workspace_member_id', memberIds);

    if (grantsError && !isMissingRelationError(grantsError)) {
      throw new Error(grantsError.message);
    }

    for (const row of grants ?? []) {
      const memberId = String((row as any).workspace_member_id);
      const next = projectMap.get(memberId) ?? [];
      next.push(String((row as any).project_id));
      projectMap.set(memberId, next);
    }
  }

  return rows.map((row: any) => {
    const scopeType = normalizeScopeType(row.scope_type);
    return {
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      userId: String(row.user_id),
      role: row.role,
      scopeType,
      projectIds: scopeType === 'projects' ? [...new Set(projectMap.get(String(row.id)) ?? [])] : [],
    };
  });
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

export async function createWorkspaceForUser(
  supabaseInput: SupabaseClient,
  userId: string,
  input: { name: string; slug?: string | null },
): Promise<WorkspaceSummary> {
  const supabase = requireScopedDataClient(supabaseInput);

  const name = normalizeWorkspaceName(input.name);
  if (!name) {
    throw new ApiError(400, 'Workspace name is required.');
  }

  if (name.length > 120) {
    throw new ApiError(400, 'Workspace name must be 120 characters or fewer.');
  }

  const requestedSlug = String(input.slug ?? '').trim().toLowerCase();
  const baseSlug = requestedSlug || slugifyWorkspaceName(name) || 'workspace';
  const slug = await resolveAvailableWorkspaceSlug(supabase, baseSlug);

  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .insert({
      name,
      slug,
      owner_user_id: userId,
    })
    .select('id, name, slug, owner_user_id, created_at')
    .single();

  if (workspaceError) {
    if (isMissingRelationError(workspaceError)) {
      throw new ApiError(409, 'Workspaces schema is not ready yet.');
    }
    throw new ApiError(500, workspaceError.message);
  }

  const workspaceId = String(workspace.id);

  const { error: memberError } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      role: 'owner',
      scope_type: 'workspace',
    });

  if (memberError) {
    if (isMissingRelationError(memberError)) {
      throw new ApiError(409, 'Workspace membership schema is not ready yet.');
    }
    throw new ApiError(500, memberError.message);
  }

  return {
    id: workspaceId,
    name: String(workspace.name ?? ''),
    slug: String(workspace.slug ?? ''),
    ownerUserId: workspace.owner_user_id ? String(workspace.owner_user_id) : null,
  };
}

export async function canUserAccessWorkspace(supabaseInput: SupabaseClient, userId: string, workspaceId: string) {
  const supabase = requireScopedDataClient(supabaseInput);
  await requireWorkspaceAccess(supabase, userId, workspaceId);
  return true;
}
