import type { WorkspaceMemberSummary, WorkspaceRole } from '@/lib/types/tenant';

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export function getWorkspaceRole(memberships: WorkspaceMemberSummary[], workspaceId: string | null) {
  if (!workspaceId) return null;
  return memberships.find((membership) => membership.workspaceId === workspaceId)?.role ?? null;
}

export function hasWorkspaceRole(
  memberships: WorkspaceMemberSummary[],
  workspaceId: string | null,
  roles: WorkspaceRole[],
) {
  const role = getWorkspaceRole(memberships, workspaceId);
  if (!role) return false;

  return roles.some((candidate) => ROLE_RANK[role] >= ROLE_RANK[candidate]);
}
