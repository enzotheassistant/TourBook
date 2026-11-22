import type { WorkspaceRole, WorkspaceScopeType } from '../../types/tenant';

// Rules for Managers ('editor') handling invites and team members.
// Owners (and the retired 'admin' level) manage everyone in their workspace.
// A Manager can only invite or change people whose access sits entirely
// inside the projects/tours the Manager has, and never above Manager.

export type AccessScope = {
  scopeType: WorkspaceScopeType;
  projectIds: string[];
  tourIds: string[];
};

export function hasFullWorkspaceControl(role: WorkspaceRole | null | undefined) {
  return role === 'owner' || role === 'admin';
}

/** True when everything `target` can reach is also reachable by `actor`. */
export function isWithinActorScope(actor: AccessScope, target: AccessScope): boolean {
  if (actor.scopeType === 'workspace') return true;
  if (target.scopeType === 'workspace') return false;

  if (actor.scopeType === 'projects') {
    const ids = target.projectIds.filter(Boolean);
    if (!ids.length) return false;
    // Tour-limited access sits inside a project the actor has in full.
    return ids.every((projectId) => actor.projectIds.includes(projectId));
  }

  // actor.scopeType === 'tours'
  if (target.scopeType !== 'tours') return false;
  const tourIds = target.tourIds.filter(Boolean);
  if (!tourIds.length) return false;
  return tourIds.every((tourId) => actor.tourIds.includes(tourId));
}

/** True when `target` can see at least one thing the actor manages. */
export function overlapsActorScope(actor: AccessScope, target: AccessScope): boolean {
  if (actor.scopeType === 'workspace' || target.scopeType === 'workspace') return true;
  if (actor.scopeType === 'projects') {
    return target.projectIds.some((projectId) => actor.projectIds.includes(projectId));
  }
  if (target.scopeType === 'projects') {
    return target.projectIds.some((projectId) => actor.projectIds.includes(projectId));
  }
  return target.tourIds.some((tourId) => actor.tourIds.includes(tourId));
}

/** Levels a Manager may hand out or change. */
export function isManagerAssignableRole(role: string | null | undefined) {
  return role === 'viewer' || role === 'crew' || role === 'editor';
}
