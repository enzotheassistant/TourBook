import type { WorkspaceMemberSummary, WorkspaceRole } from '@/lib/types/tenant';

// Levels, lowest to highest. On screen these are Viewer, Crew, Manager, Owner.
// Stored values stay as they are in the database: 'editor' is shown as
// "Manager". 'admin' is a retired level; it keeps everything it had before
// (shown as "Manager") until nobody uses it.
//
//   Viewer  — day sheets only (no guest list)
//   Crew    — day sheets + add guest list names
//   Manager — admin side (dates, tours, guest list) + invite people
//   Owner   — everything, incl. create/rename/delete projects

/** The person's highest level in a workspace (their level everywhere for "all projects"). */
export function getWorkspaceRole(memberships: WorkspaceMemberSummary[], workspaceId: string | null | undefined): WorkspaceRole | null {
  if (!workspaceId) return null;
  return memberships.find((membership) => membership.workspaceId === workspaceId)?.role ?? null;
}

/**
 * The person's level on one band. Levels can differ by band (Crew on one,
 * Manager on another), so anything tied to the band you're looking at — the
 * Admin option, the guest list, editing dates — should use this.
 */
export function getProjectRole(
  memberships: WorkspaceMemberSummary[],
  workspaceId: string | null | undefined,
  projectId: string | null | undefined,
): WorkspaceRole | null {
  if (!workspaceId) return null;
  const membership = memberships.find((item) => item.workspaceId === workspaceId);
  if (!membership) return null;
  if (membership.scopeType === 'workspace') return membership.role;
  if (!projectId) return null;
  if (membership.projectRoles) return membership.projectRoles[projectId] ?? null;
  // Older data without per-band levels: one level for every band they have.
  return membership.projectIds.includes(projectId) ? membership.role : null;
}

function isManagerOrAbove(role: WorkspaceRole | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

export function canCreateDates(role: WorkspaceRole | null | undefined) {
  return isManagerOrAbove(role);
}

export function canCreateArtists(role: WorkspaceRole | null | undefined) {
  return isManagerOrAbove(role);
}

export function canAccessAdminWorkspace(role: WorkspaceRole | null | undefined) {
  return isManagerOrAbove(role);
}

export function hasAnyAdminAccess(memberships: WorkspaceMemberSummary[]) {
  return memberships.some((membership) => canAccessAdminWorkspace(membership.role));
}

export function getFirstAdminWorkspaceId(memberships: WorkspaceMemberSummary[]) {
  return memberships.find((membership) => canAccessAdminWorkspace(membership.role))?.workspaceId ?? null;
}

/** Managers and Owners can invite people and manage who has access. */
export function canManageInvites(role: WorkspaceRole | null | undefined) {
  return isManagerOrAbove(role);
}

/** Crew and above can see the guest list. Viewers can't. */
export function canViewGuestList(role: WorkspaceRole | null | undefined) {
  return role === 'crew' || isManagerOrAbove(role);
}

/** Crew and above can add guest list names. */
export function canAddGuests(role: WorkspaceRole | null | undefined) {
  return canViewGuestList(role);
}

/** Only Managers and Owners can edit or remove guest list names. */
export function canEditGuests(role: WorkspaceRole | null | undefined) {
  return isManagerOrAbove(role);
}

/** Create and rename projects: Owner (and the retired admin level). */
export function canManageProjects(role: WorkspaceRole | null | undefined) {
  return role === 'owner' || role === 'admin';
}

/** Delete projects: Owner only. */
export function canDeleteProjects(role: WorkspaceRole | null | undefined) {
  return role === 'owner';
}

export type AssignableRole = 'viewer' | 'crew' | 'editor';

/** The levels someone can give when inviting or changing a person's access. */
export const ASSIGNABLE_ROLES: readonly AssignableRole[] = ['viewer', 'crew', 'editor'];

export function roleLabel(role: WorkspaceRole | null | undefined) {
  switch (role) {
    case 'owner': return 'Owner';
    case 'admin':
    case 'editor': return 'Manager';
    case 'crew': return 'Crew';
    case 'viewer': return 'Viewer';
    default: return '';
  }
}

export function roleDescription(role: AssignableRole) {
  switch (role) {
    case 'viewer': return 'Sees day sheets only. Good for support bands.';
    case 'crew': return 'Sees day sheets and can add guest list names.';
    case 'editor': return 'Manages dates, tours and the guest list, and can invite people.';
  }
}
