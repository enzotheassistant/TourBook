import type { BandAccess } from '@/lib/access/band-access';

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'crew' | 'viewer';
export type WorkspaceScopeType = 'workspace' | 'projects' | 'tours';

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string | null;
};

export type WorkspaceMemberSummary = {
  id: string;
  workspaceId: string;
  userId: string;
  /** Highest level across their bands (their level everywhere for "all projects"). */
  role: WorkspaceRole;
  scopeType: WorkspaceScopeType;
  projectIds: string[];
  tourIds: string[];
  /** Level on each band they can open (missing for "all projects"; use `role`). */
  projectRoles?: Record<string, WorkspaceRole>;
};

export type WorkspaceMemberDirectoryEntry = {
  id: string;
  workspaceId: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: WorkspaceRole;
  scopeType: WorkspaceScopeType;
  projectIds: string[];
  tourIds: string[];
  createdAt: string | null;
  /** Per-band access: one level per band (or one level for all projects). */
  access?: BandAccess;
};

export type ProjectSummary = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string | null;
  archivedAt: string | null;
};

export type TourSummary = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  /** Set when the tour is archived (hidden from the Tour dropdown). */
  archivedAt?: string | null;
};

export type ViewerUser = {
  id: string;
  email: string | null;
};

export type WorkspaceInviteRole = 'admin' | 'editor' | 'crew' | 'viewer';

export type WorkspaceInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export type WorkspaceInviteSummary = {
  id: string;
  workspaceId: string;
  name: string | null;
  email: string;
  role: WorkspaceInviteRole;
  scopeType: WorkspaceScopeType;
  projectIds: string[];
  tourIds: string[];
  status: WorkspaceInviteStatus;
  invitedByUserId: string;
  acceptedByUserId: string | null;
  /** Per-band access the invite gives. */
  access?: BandAccess;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type BootstrapContext = {
  user: ViewerUser | null;
  memberships: WorkspaceMemberSummary[];
  workspaces: WorkspaceSummary[];
  projects: ProjectSummary[];
  tours: TourSummary[];
  activeWorkspaceId: string | null;
  activeProjectId: string | null;
  activeTourId: string | null;
};
