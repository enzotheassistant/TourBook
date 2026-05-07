import type { TourSummary, WorkspaceInviteSummary, WorkspaceMemberDirectoryEntry, WorkspaceScopeType } from '@/lib/types/tenant';

type ScopedEntry = Pick<WorkspaceMemberDirectoryEntry, 'scopeType' | 'projectIds' | 'tourIds'> | Pick<WorkspaceInviteSummary, 'scopeType' | 'projectIds' | 'tourIds'>;

export type TeamScopeDescriptor = {
  label: string;
  detail: string | null;
};

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function joinNames(ids: string[], namesById: Map<string, string>) {
  return ids
    .map((id) => namesById.get(id) ?? id)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export function describeTeamScope(
  entry: ScopedEntry,
  options: {
    projectNameById?: Map<string, string>;
    toursById?: Map<string, Pick<TourSummary, 'id' | 'name' | 'projectId'>>;
  } = {},
): TeamScopeDescriptor {
  const projectNameById = options.projectNameById ?? new Map<string, string>();
  const toursById = options.toursById ?? new Map<string, Pick<TourSummary, 'id' | 'name' | 'projectId'>>();

  if (entry.scopeType === 'workspace') {
    return {
      label: 'Full workspace access',
      detail: 'All artists and tours in this workspace.',
    };
  }

  if (entry.scopeType === 'projects') {
    const names = joinNames(entry.projectIds, projectNameById);
    return {
      label: `${pluralize(names.length || entry.projectIds.length, 'artist')}`,
      detail: names.length ? names.join(', ') : 'Selected artists only.',
    };
  }

  const tours = entry.tourIds
    .map((tourId) => toursById.get(tourId) ?? { id: tourId, name: tourId, projectId: '' })
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  const artistNames = [...new Set(tours.map((tour) => projectNameById.get(tour.projectId) ?? null).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
  const tourNames = tours.map((tour) => tour.name || tour.id);
  const detailParts = [] as string[];
  if (artistNames.length) detailParts.push(artistNames.join(', '));
  if (tourNames.length) detailParts.push(tourNames.join(', '));

  return {
    label: `${pluralize(tourNames.length || entry.tourIds.length, 'tour')}${artistNames.length ? ` · ${pluralize(artistNames.length, 'artist')}` : ''}`,
    detail: detailParts.length ? detailParts.join(' • ') : 'Selected tours only.',
  };
}

export function matchesProjectContext(
  entry: ScopedEntry,
  contextProjectId: string | null | undefined,
  toursById: Map<string, Pick<TourSummary, 'id' | 'name' | 'projectId'>> = new Map(),
) {
  if (!contextProjectId) return true;
  if (entry.scopeType === 'workspace') return true;
  if (entry.scopeType === 'projects') return entry.projectIds.includes(contextProjectId);
  return entry.tourIds.some((tourId) => toursById.get(tourId)?.projectId === contextProjectId);
}

export function splitInvitesByStatus(invites: WorkspaceInviteSummary[]) {
  return {
    pending: invites.filter((invite) => invite.status === 'pending'),
    history: invites.filter((invite) => invite.status !== 'pending'),
  };
}

export type AcceptedTeamDirectoryEntry = {
  id: string;
  workspaceId: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: WorkspaceMemberDirectoryEntry['role'];
  scopeType: WorkspaceScopeType;
  projectIds: string[];
  tourIds: string[];
  createdAt: string | null;
  source: 'member' | 'accepted-invite';
  memberId: string | null;
  inviteId: string | null;
};

export function buildAcceptedTeamDirectory(
  members: WorkspaceMemberDirectoryEntry[],
  invites: WorkspaceInviteSummary[],
): AcceptedTeamDirectoryEntry[] {
  const entries = members.map((member) => ({
    ...member,
    source: 'member' as const,
    memberId: member.id,
    inviteId: null,
  }));

  const memberUserIds = new Set(members.map((member) => member.userId).filter(Boolean));
  const memberEmails = new Set(members.map((member) => String(member.email ?? '').trim().toLowerCase()).filter(Boolean));

  const acceptedInviteFallbacks = invites
    .filter((invite) => invite.status === 'accepted')
    .filter((invite) => {
      const acceptedByUserId = String(invite.acceptedByUserId ?? '').trim();
      const inviteEmail = String(invite.email ?? '').trim().toLowerCase();
      if (acceptedByUserId && memberUserIds.has(acceptedByUserId)) return false;
      if (inviteEmail && memberEmails.has(inviteEmail)) return false;
      return true;
    })
    .map((invite) => ({
      id: `accepted-invite:${invite.id}`,
      workspaceId: invite.workspaceId,
      userId: String(invite.acceptedByUserId ?? invite.email),
      name: invite.name,
      email: invite.email,
      role: invite.role,
      scopeType: invite.scopeType,
      projectIds: invite.projectIds,
      tourIds: invite.tourIds,
      createdAt: invite.updatedAt,
      source: 'accepted-invite' as const,
      memberId: null,
      inviteId: invite.id,
    }));

  return [...entries, ...acceptedInviteFallbacks];
}

export function getContextLabel(scopeType: WorkspaceScopeType, matchesContext: boolean, contextProjectName?: string | null) {
  if (!contextProjectName) return null;
  if (matchesContext) {
    return scopeType === 'workspace' ? `Includes ${contextProjectName}` : `In ${contextProjectName}`;
  }
  return `Outside ${contextProjectName}`;
}
