import type { ProjectSummary } from '@/lib/types/tenant';

export function getProjectsForWorkspace(projects: ProjectSummary[], workspaceId: string | null) {
  if (!workspaceId) return [];
  return projects.filter((project) => project.workspaceId === workspaceId);
}

export function canSwitchProject(projects: ProjectSummary[], workspaceId: string | null) {
  return getProjectsForWorkspace(projects, workspaceId).length > 1;
}

export function pickNextProjectId(currentProjectId: string | null, requestedProjectId: string, allowedProjects: ProjectSummary[]) {
  if (!allowedProjects.some((project) => project.id === requestedProjectId)) return currentProjectId;
  return requestedProjectId;
}
