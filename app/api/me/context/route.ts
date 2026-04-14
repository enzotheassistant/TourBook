import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server';
import type {
  BootstrapContext,
  ProjectSummary,
  TourSummary,
  WorkspaceMemberSummary,
  WorkspaceSummary,
} from '@/lib/types/tenant';

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeCode = 'code' in error ? String((error as { code?: string }).code ?? '') : '';
  const maybeMessage = 'message' in error ? String((error as { message?: string }).message ?? '') : '';
  return maybeCode === '42P01' || maybeMessage.toLowerCase().includes('does not exist');
}

export async function GET(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { user } = authState;
  const baseContext: BootstrapContext = {
    user,
    memberships: [],
    workspaces: [],
    projects: [],
    tours: [],
    activeWorkspaceId: null,
    activeProjectId: null,
    activeTourId: null,
  };

  try {
    // Phase 1 intentionally uses the service role here for bootstrap reads before RLS and the scoped data layer are in place.
    const supabase = createServiceRoleSupabaseClient();

    const membershipsResult = await supabase
      .from('workspace_members')
      .select('id, workspace_id, user_id, role')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (membershipsResult.error) {
      if (isMissingRelationError(membershipsResult.error)) {
        return finalizeAuthResponse(NextResponse.json(baseContext), authState);
      }

      throw membershipsResult.error;
    }

    const memberships: WorkspaceMemberSummary[] = (membershipsResult.data ?? []).map((row: any) => ({
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      userId: String(row.user_id),
      role: row.role,
    }));

    if (!memberships.length) {
      return finalizeAuthResponse(NextResponse.json({ ...baseContext, memberships }), authState);
    }

    const workspaceIds = [...new Set(memberships.map((membership) => membership.workspaceId))];

    const workspacesResult = await supabase
      .from('workspaces')
      .select('id, name, slug, owner_user_id, created_at')
      .in('id', workspaceIds)
      .order('created_at', { ascending: true });

    if (workspacesResult.error) throw workspacesResult.error;

    const workspaces: WorkspaceSummary[] = (workspacesResult.data ?? []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      slug: String(row.slug ?? ''),
      ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
    }));

    let allProjects: ProjectSummary[] = [];
    const projectsResult = await supabase
      .from('projects')
      .select('id, workspace_id, name, slug, archived_at, created_at')
      .in('workspace_id', workspaceIds)
      .order('created_at', { ascending: true });

    if (projectsResult.error) {
      if (!isMissingRelationError(projectsResult.error)) throw projectsResult.error;
    } else {
      allProjects = (projectsResult.data ?? []).map((row: any) => ({
        id: String(row.id),
        workspaceId: String(row.workspace_id),
        name: String(row.name ?? ''),
        slug: row.slug ? String(row.slug) : null,
        archivedAt: row.archived_at ? String(row.archived_at) : null,
      }));
    }

    const workspaceWithProjects = workspaces.find((workspace) =>
      allProjects.some((project) => project.workspaceId === workspace.id),
    );

    const activeWorkspaceId = workspaceWithProjects?.id ?? workspaces[0]?.id ?? null;
    const projects = activeWorkspaceId
      ? allProjects.filter((project) => project.workspaceId === activeWorkspaceId)
      : [];

    const activeProjectId = projects[0]?.id ?? null;

    let tours: TourSummary[] = [];
    if (activeWorkspaceId && activeProjectId) {
      const toursResult = await supabase
        .from('tours')
        .select('id, workspace_id, project_id, name, status, start_date, end_date, created_at')
        .eq('workspace_id', activeWorkspaceId)
        .eq('project_id', activeProjectId)
        .order('created_at', { ascending: true });

      if (toursResult.error) {
        if (!isMissingRelationError(toursResult.error)) throw toursResult.error;
      } else {
        tours = (toursResult.data ?? []).map((row: any) => ({
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          projectId: String(row.project_id),
          name: String(row.name ?? ''),
          status: String(row.status ?? ''),
          startDate: row.start_date ? String(row.start_date) : null,
          endDate: row.end_date ? String(row.end_date) : null,
        }));
      }
    }

    return finalizeAuthResponse(NextResponse.json({
      user,
      memberships,
      workspaces,
      projects,
      tours,
      activeWorkspaceId,
      activeProjectId,
      activeTourId: null,
    } satisfies BootstrapContext), authState);
  } catch (error) {
    console.error('Unable to build /api/me/context response', error);
    return finalizeAuthResponse(NextResponse.json({ error: 'Unable to build bootstrap context.' }, { status: 500 }), authState);
  }
}
