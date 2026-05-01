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

function isOptionalBootstrapSchemaDriftError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeCode = 'code' in error ? String((error as { code?: string }).code ?? '') : '';
  const maybeMessage = 'message' in error ? String((error as { message?: string }).message ?? '') : '';
  const message = maybeMessage.toLowerCase();
  return isMissingRelationError(error) || maybeCode === '42703' || message.includes('column') || message.includes('schema cache');
}

export async function GET(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) {
    console.info('[TourBook Session] GET /api/me/context — auth required, returning unauthorized');
    return authState;
  }

  const debug = request.nextUrl.searchParams.get('debug') === '1';
  const debugInfo: Record<string, unknown> = {};

  const { user, supabase } = authState;
  console.info('[TourBook Session] GET /api/me/context — building context', {
    userId: user.id,
  });
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
        .select('*')
        .in('workspace_member_id', memberIds);

      if (tourGrantsResult.error && !isOptionalBootstrapSchemaDriftError(tourGrantsResult.error)) {
        throw tourGrantsResult.error;
      }

      for (const row of tourGrantsResult.data ?? []) {
        const memberId = String((row as any).workspace_member_id);
        const rawTourId = (row as any).tour_id;
        if (rawTourId) {
          const tours = memberTourMap.get(memberId) ?? [];
          tours.push(String(rawTourId));
          memberTourMap.set(memberId, tours);
        }
        const rawProjectId = (row as any).project_id;
        if (rawProjectId) {
          const projects = memberProjectMap.get(memberId) ?? [];
          projects.push(String(rawProjectId));
          memberProjectMap.set(memberId, projects);
        }
      }
    }

    const unresolvedTourIds = [...new Set(Array.from(memberTourMap.values()).flat().filter(Boolean))];

    if (unresolvedTourIds.length) {
      const tourProjectResult = await supabase
        .from('tours')
        .select('*')
        .in('id', unresolvedTourIds);

      if (tourProjectResult.error) {
        if (!isOptionalBootstrapSchemaDriftError(tourProjectResult.error)) {
          throw tourProjectResult.error;
        }
      } else {
        const projectIdByTourId = new Map<string, string>();
        for (const row of tourProjectResult.data ?? []) {
          if ((row as any)?.id && (row as any)?.project_id) {
            projectIdByTourId.set(String((row as any).id), String((row as any).project_id));
          }
        }

        for (const membershipRow of membershipRows) {
          const memberId = String((membershipRow as any).id);
          const existingProjects = memberProjectMap.get(memberId) ?? [];
          const nextProjects = new Set(existingProjects);

          for (const tourId of memberTourMap.get(memberId) ?? []) {
            const projectId = projectIdByTourId.get(tourId);
            if (projectId) nextProjects.add(projectId);
          }

          if (nextProjects.size) {
            memberProjectMap.set(memberId, [...nextProjects]);
          }
        }
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

    // If the user truly has no workspace_members rows at all, short-circuit with an empty context.
    // If they DO have raw DB rows but all were filtered out (e.g. project-scoped membership
    // where workspace_member_projects is empty due to RLS, a race, or missing grants), we must
    // NOT discard workspace data — the user IS a collaborator and should NOT see the
    // "Create your first workspace" onboarding panel.
    if (!memberships.length && !membershipRows.length) {
      return finalizeAuthResponse(NextResponse.json({ ...baseContext, memberships }), authState);
    }

    // Derive workspace IDs from validated memberships when available, otherwise fall back
    // to the raw membership rows so we still load workspace info for collaborators whose
    // project/tour grants could not be resolved.
    const workspaceIds = memberships.length > 0
      ? [...new Set(memberships.map((membership) => membership.workspaceId))]
      : [...new Set(membershipRows.map((row: any) => String(row.workspace_id)))];

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
      // Important: this request runs through the authenticated user-scoped client, so
      // the projects query is already filtered by RLS. Do not apply a second pass based
      // on the derived `memberships` summaries here.
      //
      // Why: invite acceptance can create a real workspace_members row before the direct
      // grant-table reads used to build `memberships` become visible in this route (or if
      // those grant-table selects are blocked/drifted while the security-definer RLS helper
      // still authorizes the project rows). In that state, `projectsResult` can correctly
      // contain accessible invited projects while `memberships` is temporarily empty.
      // Re-filtering by `memberships` would incorrectly drop every project and leave invited
      // collaborators on the "no active artist" / setup card even though RLS says they have
      // project access.
      allProjects = (projectsResult.data ?? []).map((row: any) => ({
        id: String(row.id),
        workspaceId: String(row.workspace_id),
        name: String(row.name ?? ''),
        slug: row.slug ? String(row.slug) : null,
        archivedAt: null,
      }));
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
        .select('*')
        .eq('workspace_id', activeWorkspaceId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (toursResult.error) {
        if (!isOptionalBootstrapSchemaDriftError(toursResult.error)) throw toursResult.error;
      } else {
        // Same reasoning as projects above: the authenticated client query is already
        // RLS-filtered, so trust the returned tour set instead of re-deriving access from
        // `memberships`, which may lag or be temporarily incomplete during invite join.
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

    if (debug) {
      debugInfo.readOnly = true;
      debugInfo.projectCount = allProjects.length;
    }

    const activeToursForProject = activeProjectId ? tours.filter((tour) => tour.projectId === activeProjectId) : [];
    const activeTourId = activeToursForProject[0]?.id ?? null;

    console.info('[TourBook Session] GET /api/me/context — success', {
      userId: user.id,
      workspaceCount: workspaces.length,
      projectCount: allProjects.length,
      tourCount: tours.length,
      membershipCount: memberships.length,
      hasActiveWorkspace: !!activeWorkspaceId,
      hasActiveProject: !!activeProjectId,
      hasActiveTour: !!activeTourId,
    });

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
    const errorType = error instanceof Error ? error.name : typeof error;
    console.info('[TourBook Session] GET /api/me/context — error', {
      userId: user.id,
      errorType,
      message: error instanceof Error ? error.message?.substring(0, 100) : String(error),
    });

    await recordApiRuntimeError(request, {
      endpoint: '/api/me/context',
      status: 500,
      error,
    });
    return finalizeAuthResponse(NextResponse.json({ error: 'Unable to build bootstrap context.' }, { status: 500 }), authState);
  }
}
