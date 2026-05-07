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

const ACCEPTED_INVITE_FALLBACK_MAX_AGE_MS = 15 * 60 * 1000;

function isAcceptedInviteFallbackFresh(updatedAt: string | null | undefined, now = Date.now()) {
  if (!updatedAt) return false;
  const parsed = Date.parse(updatedAt);
  if (!Number.isFinite(parsed)) return false;
  return now - parsed <= ACCEPTED_INVITE_FALLBACK_MAX_AGE_MS;
}

function normalizeDirectoryEmail(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function getInviteIdentityKeys(invite: WorkspaceInviteSummary) {
  const keys: string[] = [];
  const acceptedByUserId = String(invite.acceptedByUserId ?? '').trim();
  const email = normalizeDirectoryEmail(invite.email);
  if (acceptedByUserId) keys.push(`user:${acceptedByUserId}`);
  if (email) keys.push(`email:${email}`);
  return keys;
}

function getMemberIdentityKeys(member: WorkspaceMemberDirectoryEntry) {
  const keys: string[] = [];
  const userId = String(member.userId ?? '').trim();
  const email = normalizeDirectoryEmail(member.email);
  if (userId) keys.push(`user:${userId}`);
  if (email) keys.push(`email:${email}`);
  return keys;
}

function pickLatestInvite(current: WorkspaceInviteSummary | null | undefined, invite: WorkspaceInviteSummary) {
  if (!current) return invite;
  const currentTime = Date.parse(current.updatedAt || current.createdAt || '');
  const inviteTime = Date.parse(invite.updatedAt || invite.createdAt || '');
  if (!Number.isFinite(currentTime)) return invite;
  if (!Number.isFinite(inviteTime)) return current;
  return inviteTime >= currentTime ? invite : current;
}

export function buildAcceptedTeamDirectory(
  members: WorkspaceMemberDirectoryEntry[],
  invites: WorkspaceInviteSummary[],
): AcceptedTeamDirectoryEntry[] {
  const latestInviteByIdentity = new Map<string, WorkspaceInviteSummary>();
  const latestAcceptedInviteByIdentity = new Map<string, WorkspaceInviteSummary>();

  invites.forEach((invite) => {
    const identityKeys = getInviteIdentityKeys(invite);
    if (!identityKeys.length) return;

    identityKeys.forEach((key) => {
      latestInviteByIdentity.set(key, pickLatestInvite(latestInviteByIdentity.get(key), invite));
      if (invite.status === 'accepted') {
        latestAcceptedInviteByIdentity.set(key, pickLatestInvite(latestAcceptedInviteByIdentity.get(key), invite));
      }
    });
  });

  const entries = members.map((member) => {
    const matchingAcceptedInvite = getMemberIdentityKeys(member).reduce<WorkspaceInviteSummary | null>((latest, key) => {
      const invite = latestAcceptedInviteByIdentity.get(key);
      return invite ? pickLatestInvite(latest, invite) : latest;
    }, null);

    const needsScopeHydration = member.scopeType !== 'workspace'
      && ((member.scopeType === 'projects' && member.projectIds.length === 0)
        || (member.scopeType === 'tours' && (member.projectIds.length === 0 || member.tourIds.length === 0)));

    return {
      ...member,
      projectIds: needsScopeHydration && matchingAcceptedInvite ? matchingAcceptedInvite.projectIds : member.projectIds,
      tourIds: needsScopeHydration && matchingAcceptedInvite && member.scopeType === 'tours' ? matchingAcceptedInvite.tourIds : member.tourIds,
      source: 'member' as const,
      memberId: member.id,
      inviteId: null,
    };
  });

  const memberIdentityKeys = new Set(entries.flatMap((member) => getMemberIdentityKeys(member)));

  const acceptedInviteFallbacks = invites
    .filter((invite) => invite.status === 'accepted')
    .filter((invite) => isAcceptedInviteFallbackFresh(invite.updatedAt))
    .filter((invite) => getInviteIdentityKeys(invite).some((key) => latestInviteByIdentity.get(key)?.id === invite.id))
    .filter((invite) => getInviteIdentityKeys(invite).every((key) => !memberIdentityKeys.has(key)))
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
