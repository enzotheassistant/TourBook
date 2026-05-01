import type { WorkspaceInviteSummary } from '@/lib/types/tenant';

export function hasResolvedInviteContext(
  invite: Pick<WorkspaceInviteSummary, 'workspaceId' | 'scopeType' | 'projectIds' | 'tourIds'>,
  context: { activeWorkspaceId: string | null; activeProjectId: string | null; activeTourId: string | null },
) {
  if (context.activeWorkspaceId !== invite.workspaceId) return false;

  const projectScopeResolved =
    invite.scopeType !== 'projects'
    || invite.projectIds.length === 0
    || invite.projectIds.includes(context.activeProjectId ?? '');

  const tourScopeResolved =
    invite.scopeType !== 'tours'
    || invite.tourIds.length === 0
    || invite.tourIds.includes(context.activeTourId ?? '');

  return projectScopeResolved && tourScopeResolved;
}
