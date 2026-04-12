export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

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
