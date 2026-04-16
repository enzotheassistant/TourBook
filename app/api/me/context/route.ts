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

function normalizeScopeType(value: unknown): 'workspace' | 'projects' | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || raw === 'workspace') return 'workspace';
  if (raw === 'projects') return 'projects';
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
    }

    const memberships: WorkspaceMemberSummary[] = membershipRows
      .map((row: any) => {
        const scopeType = normalizeScopeType(row.scope_type);
        if (!scopeType) return null;
        const projectIds = scopeType === 'projects' ? [...new Set(memberProjectMap.get(String(row.id)) ?? [])] : [];
        if (scopeType === 'projects' && projectIds.length === 0) return null;

        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          userId: String(row.user_id),
          role: row.role,
          scopeType,
          projectIds,
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
    if (activeWorkspaceId && activeProjectId) {
      const toursResult = await supabase
        .from('tours')
        .select('id, workspace_id, project_id, name, created_at')
        .eq('workspace_id', activeWorkspaceId)
        .eq('project_id', activeProjectId)
        .order('created_at', { ascending: true })
        .limit(200);

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

    if (debug) {
      debugInfo.readOnly = true;
      debugInfo.projectCount = allProjects.length;
    }

    return finalizeAuthResponse(NextResponse.json({
      user,
      memberships,
      workspaces,
      projects: allProjects,
      tours,
      activeWorkspaceId,
      activeProjectId,
      activeTourId: null,
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
