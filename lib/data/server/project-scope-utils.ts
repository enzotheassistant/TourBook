export type ProjectScopeType = 'workspace' | 'projects' | 'tours';

export function canAccessProjectByScope(scopeType: ProjectScopeType, grantedProjectIds: string[], projectId: string) {
  if (!projectId) return false;
  if (scopeType === 'workspace') return true;
  return grantedProjectIds.includes(projectId);
}

export function canAccessTourByScope(
  scopeType: ProjectScopeType,
  grantedProjectIds: string[],
  grantedTourIds: string[],
  projectId: string,
  tourId: string | null | undefined,
) {
  if (!projectId) return false;
  if (scopeType === 'workspace') return true;
  if (!tourId) return scopeType !== 'tours' && grantedProjectIds.includes(projectId);
  if (scopeType === 'projects') return grantedProjectIds.includes(projectId);
  return grantedTourIds.includes(tourId);
}
