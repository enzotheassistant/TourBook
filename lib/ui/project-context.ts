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

export type ProjectOption = { value: string; label: string; workspaceId: string };

/**
 * One flat list of every project the person can open, across every workspace
 * (e.g. bands run by different owners). Names are shown as-is; only when two
 * projects share a name is the owner's workspace name added to tell them apart.
 */
export function buildProjectOptions(
  projects: ProjectSummary[],
  workspaces: Array<{ id: string; name: string }>,
  filter?: (project: ProjectSummary) => boolean,
): ProjectOption[] {
  const visible = filter ? projects.filter(filter) : projects;
  const nameOf = (project: ProjectSummary) => project.name || project.slug || project.id;
  const counts = new Map<string, number>();
  for (const project of visible) {
    const key = nameOf(project).trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const workspaceName = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));
  return visible
    .map((project) => {
      const name = nameOf(project);
      const duplicate = (counts.get(name.trim().toLowerCase()) ?? 0) > 1;
      const owner = workspaceName.get(project.workspaceId);
      return {
        value: project.id,
        label: duplicate && owner ? `${name} (${owner})` : name,
        workspaceId: project.workspaceId,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}
