import type { WorkspaceMemberSummary, WorkspaceRole } from '@/lib/types/tenant';

export function getWorkspaceRole(memberships: WorkspaceMemberSummary[], workspaceId: string | null | undefined): WorkspaceRole | null {
  if (!workspaceId) return null;
  return memberships.find((membership) => membership.workspaceId === workspaceId)?.role ?? null;
}

export function canCreateDates(role: WorkspaceRole | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

export function canCreateArtists(role: WorkspaceRole | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'editor';
}
