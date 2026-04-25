export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';
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
  role: WorkspaceRole;
  scopeType: WorkspaceScopeType;
  projectIds: string[];
  tourIds: string[];
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
};

export type ViewerUser = {
  id: string;
  email: string | null;
};

export type WorkspaceInviteRole = 'admin' | 'editor' | 'viewer';

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
