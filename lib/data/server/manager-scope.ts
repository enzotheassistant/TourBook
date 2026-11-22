import type { WorkspaceRole, WorkspaceScopeType } from '../../types/tenant';
import type { BandAccess, BandAccessEntry } from '../../access/band-access';

function isManagerRole(role: string | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

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

// ---- Per-band versions (levels can differ by band) -------------------------


/** Which of these bands the actor manages (Manager or Owner on that band). */
export function managedProjectIdsFor(actor: BandAccess, candidateProjectIds: string[]): string[] {
  if (actor.allProjects) return isManagerRole(actor.role) ? [...new Set(candidateProjectIds)] : [];
  return actor.entries.filter((entry) => isManagerRole(entry.role)).map((entry) => entry.projectId);
}

/**
 * Can the actor hand out this band entry? They must manage the band, the level
 * must be Viewer/Crew/Manager, and if the actor only has some tours of that
 * band they can only hand out those tours.
 */
export function canGrantBandEntry(actor: BandAccess, entry: BandAccessEntry): boolean {
  if (!isManagerAssignableRole(entry.role)) return false;
  if (actor.allProjects) return isManagerRole(actor.role);
  const own = actor.entries.find((item) => item.projectId === entry.projectId);
  if (!own || !isManagerRole(own.role)) return false;
  if (!own.tourIds.length) return true;
  return entry.tourIds.length > 0 && entry.tourIds.every((tourId) => own.tourIds.includes(tourId));
}

/** Can the actor manage ALL of someone's access (e.g. remove them entirely)? */
export function canManageWholeAccess(actor: BandAccess, target: BandAccess): boolean {
  if (target.allProjects) return actor.allProjects && isManagerRole(actor.role) && isManagerAssignableRole(target.role);
  return target.entries.length > 0 && target.entries.every((entry) => canGrantBandEntry(actor, entry));
}

/** Does `target` share at least one band with the actor? (Who shows on a Manager's Team page.) */
export function sharesBandWith(actor: BandAccess, target: BandAccess): boolean {
  if (actor.allProjects || target.allProjects) return true;
  const mine = new Set(actor.entries.map((entry) => entry.projectId));
  return target.entries.some((entry) => mine.has(entry.projectId));
}
