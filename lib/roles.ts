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

export function canAccessAdminWorkspace(role: WorkspaceRole | null | undefined) {
  return canCreateArtists(role);
}

export function hasAnyAdminAccess(memberships: WorkspaceMemberSummary[]) {
  return memberships.some((membership) => canAccessAdminWorkspace(membership.role));
}

export function getFirstAdminWorkspaceId(memberships: WorkspaceMemberSummary[]) {
  return memberships.find((membership) => canAccessAdminWorkspace(membership.role))?.workspaceId ?? null;
}

export function canManageInvites(role: WorkspaceRole | null | undefined) {
  return role === 'owner' || role === 'admin';
}
