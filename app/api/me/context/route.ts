import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { recordApiRuntimeError } from '@/lib/telemetry/runtime-errors';
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

function normalizeScopeType(value: unknown): 'workspace' | 'projects' | 'tours' | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || raw === 'workspace') return 'workspace';
  if (raw === 'projects') return 'projects';
  if (raw === 'tours') return 'tours';
  return null;
}

export async function GET(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const debug = request.nextUrl.searchParams.get('debug') === '1';
  const debugInfo: Record<string, unknown> = {};

  const { user, supabase } = authState;
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
    const membershipsResult = await supabase
      .from('workspace_members')
      .select('id, workspace_id, user_id, role, scope_type')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (membershipsResult.error) {
      if (isMissingRelationError(membershipsResult.error)) {
        return finalizeAuthResponse(NextResponse.json(baseContext), authState);
      }

      throw membershipsResult.error;
    }

    const membershipRows = membershipsResult.data ?? [];
    const memberIds = membershipRows.map((row: any) => String(row.id));
    const memberProjectMap = new Map<string, string[]>();
    const memberTourMap = new Map<string, string[]>();

    if (memberIds.length) {
      const grantsResult = await supabase
        .from('workspace_member_projects')
        .select('workspace_member_id, project_id')
        .in('workspace_member_id', memberIds);

      if (grantsResult.error && !isMissingRelationError(grantsResult.error)) {
        throw grantsResult.error;
      }

      for (const row of grantsResult.data ?? []) {
        const memberId = String((row as any).workspace_member_id);
        const list = memberProjectMap.get(memberId) ?? [];
        list.push(String((row as any).project_id));
        memberProjectMap.set(memberId, list);
      }

      const tourGrantsResult = await supabase
        .from('workspace_member_tours')
        .select('workspace_member_id, project_id, tour_id')
        .in('workspace_member_id', memberIds);

      if (tourGrantsResult.error && !isMissingRelationError(tourGrantsResult.error)) {
        throw tourGrantsResult.error;
      }

      for (const row of tourGrantsResult.data ?? []) {
        const memberId = String((row as any).workspace_member_id);
        const tours = memberTourMap.get(memberId) ?? [];
        tours.push(String((row as any).tour_id));
        memberTourMap.set(memberId, tours);
        const projects = memberProjectMap.get(memberId) ?? [];
        projects.push(String((row as any).project_id));
        memberProjectMap.set(memberId, projects);
      }
    }

    const memberships: WorkspaceMemberSummary[] = membershipRows
      .map((row: any) => {
        const scopeType = normalizeScopeType(row.scope_type);
        if (!scopeType) return null;
        const projectIds = scopeType === 'workspace' ? [] : [...new Set(memberProjectMap.get(String(row.id)) ?? [])];
        const tourIds = scopeType === 'tours' ? [...new Set(memberTourMap.get(String(row.id)) ?? [])] : [];
        if (scopeType === 'projects' && projectIds.length === 0) return null;
        if (scopeType === 'tours' && tourIds.length === 0) return null;

        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          userId: String(row.user_id),
          role: row.role,
          scopeType,
          projectIds,
          tourIds,
        };
      })
      .filter(Boolean) as WorkspaceMemberSummary[];

    if (!memberships.length) {
      return finalizeAuthResponse(NextResponse.json({ ...baseContext, memberships }), authState);
    }

    const workspaceIds = [...new Set(memberships.map((membership) => membership.workspaceId))];

    const workspacesResult = await supabase
      .from('workspaces')
      .select('id, name, slug, owner_user_id, created_at')
      .in('id', workspaceIds)
      .order('created_at', { ascending: true })
      .limit(200);

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
      .select('id, workspace_id, name, slug, created_at')
      .in('workspace_id', workspaceIds)
      .order('created_at', { ascending: true })
      .limit(200);

    if (projectsResult.error) {
      if (!isMissingRelationError(projectsResult.error)) throw projectsResult.error;
    } else {
      const unfiltered = (projectsResult.data ?? []).map((row: any) => ({
        id: String(row.id),
        workspaceId: String(row.workspace_id),
        name: String(row.name ?? ''),
        slug: row.slug ? String(row.slug) : null,
        archivedAt: null,
      }));

      const allowedByWorkspace = memberships.reduce((map: Map<string, Set<string> | null>, membership) => {
        if (membership.scopeType === 'workspace') {
          map.set(membership.workspaceId, null);
        } else if (!map.has(membership.workspaceId)) {
          map.set(membership.workspaceId, new Set(membership.projectIds));
        } else {
          const existing = map.get(membership.workspaceId);
          if (existing) {
            membership.projectIds.forEach((projectId) => existing.add(projectId));
          }
        }
        return map;
      }, new Map<string, Set<string> | null>());

      allProjects = unfiltered.filter((project) => {
        const allowed = allowedByWorkspace.get(project.workspaceId);
        if (allowed === null) return true;
        if (!allowed) return false;
        return allowed.has(project.id);
      });
    }

    const workspaceWithProjects = workspaces.find((workspace) =>
      allProjects.some((project) => project.workspaceId === workspace.id),
    );

    const activeWorkspaceId = workspaceWithProjects?.id ?? workspaces[0]?.id ?? null;
    const projectsForActiveWorkspace = activeWorkspaceId
      ? allProjects.filter((project) => project.workspaceId === activeWorkspaceId)
      : [];

    const activeProjectId = projectsForActiveWorkspace[0]?.id ?? null;

    let tours: TourSummary[] = [];
    if (activeWorkspaceId) {
      const toursResult = await supabase
        .from('tours')
        .select('id, workspace_id, project_id, name, status, start_date, end_date, created_at')
        .eq('workspace_id', activeWorkspaceId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (toursResult.error) {
        if (!isMissingRelationError(toursResult.error)) throw toursResult.error;
      } else {
        const workspaceMemberships = memberships.filter((membership) => membership.workspaceId === activeWorkspaceId);
        const allowedProjectIds = new Set(
          workspaceMemberships.flatMap((membership) => membership.scopeType === 'workspace' ? [] : membership.projectIds),
        );
        const allowedTourIds = new Set(
          workspaceMemberships.flatMap((membership) => membership.scopeType === 'tours' ? membership.tourIds : []),
        );
        const hasWorkspaceScope = workspaceMemberships.some((membership) => membership.scopeType === 'workspace');
        const hasProjectScope = workspaceMemberships.some((membership) => membership.scopeType === 'projects');

        tours = (toursResult.data ?? [])
          .filter((row: any) => {
            if (hasWorkspaceScope) return true;
            const rowProjectId = String(row.project_id);
            const rowTourId = String(row.id);
            if (hasProjectScope && allowedProjectIds.has(rowProjectId)) return true;
            return allowedTourIds.has(rowTourId);
          })
          .map((row: any) => ({
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

    if (debug) {
      debugInfo.readOnly = true;
      debugInfo.projectCount = allProjects.length;
    }

    const activeToursForProject = activeProjectId ? tours.filter((tour) => tour.projectId === activeProjectId) : [];
    const activeTourId = activeToursForProject[0]?.id ?? null;

    return finalizeAuthResponse(NextResponse.json({
      user,
      memberships,
      workspaces,
      projects: allProjects,
      tours,
      activeWorkspaceId,
      activeProjectId,
      activeTourId,
      ...(debug ? { _debug: debugInfo } : {}),
    }), authState);
  } catch (error) {
    await recordApiRuntimeError(request, {
      endpoint: '/api/me/context',
      status: 500,
      error,
    });
    return finalizeAuthResponse(NextResponse.json({ error: 'Unable to build bootstrap context.' }, { status: 500 }), authState);
  }
}
