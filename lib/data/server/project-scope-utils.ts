export type ProjectScopeType = 'workspace' | 'projects';

export function canAccessProjectByScope(scopeType: ProjectScopeType, grantedProjectIds: string[], projectId: string) {
  if (!projectId) return false;
  if (scopeType === 'workspace') return true;
  return grantedProjectIds.includes(projectId);
}
