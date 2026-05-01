import type { PendingInviteScope } from '@/lib/app-context-storage';
import type { BootstrapContext } from '@/lib/types/tenant';

type StoredContextSelection = {
  workspaceId: string | null;
  projectId: string | null;
  tourId: string | null;
};

export function resolveActiveContextSelection(
  data: BootstrapContext,
  stored: StoredContextSelection,
  pendingInviteScope: PendingInviteScope | null,
) {
  const fallbackWorkspaceId =
    data.workspaces.find((workspace) => data.projects.some((project) => project.workspaceId === workspace.id))?.id
    ?? data.workspaces[0]?.id
    ?? null;

  const inviteWorkspaceId = data.workspaces.some((workspace) => workspace.id === pendingInviteScope?.workspaceId)
    ? pendingInviteScope?.workspaceId ?? null
    : null;

  const storedWorkspaceHasProjects = stored.workspaceId
    ? data.projects.some((project) => project.workspaceId === stored.workspaceId)
    : false;

  const dataWorkspaceHasProjects = data.activeWorkspaceId
    ? data.projects.some((project) => project.workspaceId === data.activeWorkspaceId)
    : false;

  const activeWorkspaceId = inviteWorkspaceId
    ?? (stored.workspaceId && data.workspaces.some((workspace) => workspace.id === stored.workspaceId)
      ? (storedWorkspaceHasProjects || !fallbackWorkspaceId ? stored.workspaceId : fallbackWorkspaceId)
      : (data.activeWorkspaceId && data.workspaces.some((workspace) => workspace.id === data.activeWorkspaceId)
        ? (dataWorkspaceHasProjects || !fallbackWorkspaceId ? data.activeWorkspaceId : fallbackWorkspaceId)
        : fallbackWorkspaceId));

  const activeProjects = activeWorkspaceId
    ? data.projects.filter((project) => project.workspaceId === activeWorkspaceId)
    : [];

  const inviteProjectId = pendingInviteScope
    ? activeProjects.find((project) => pendingInviteScope.projectIds.includes(project.id))?.id ?? null
    : null;

  const activeProjectId = inviteProjectId
    ?? (activeProjects.some((project) => project.id === stored.projectId)
      ? stored.projectId
      : activeProjects.some((project) => project.id === data.activeProjectId)
        ? data.activeProjectId
        : activeProjects[0]?.id ?? null);

  const activeTours = activeProjectId
    ? data.tours.filter((tour) => tour.projectId === activeProjectId)
    : [];

  const inviteTourId = pendingInviteScope
    ? activeTours.find((tour) => pendingInviteScope.tourIds.includes(tour.id))?.id ?? null
    : null;

  const activeTourId = inviteTourId
    ?? (activeTours.some((tour) => tour.id === stored.tourId)
      ? stored.tourId
      : activeTours.some((tour) => tour.id === data.activeTourId)
        ? data.activeTourId
        : activeTours[0]?.id ?? null);

  return {
    activeWorkspaceId,
    activeProjectId,
    activeTourId,
  };
}
