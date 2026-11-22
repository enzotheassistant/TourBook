import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { removeWorkspaceMemberScoped, updateWorkspaceMemberScoped } from '@/lib/data/server/members';
import { getProjectNamesForInviteScope } from '@/lib/data/server/invites';
import { sendAccessAddedEmailBestEffort } from '@/lib/invites/email-delivery';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; memberId: string }> },
) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { workspaceId, memberId } = await params;

  try {
    const body = (await request.json()) as { access?: unknown; role?: string; scopeType?: string; projectIds?: string[]; tourIds?: string[] };
    const { addedProjectIds = [], ...member } = await updateWorkspaceMemberScoped(authState.supabase, authState.user.id, {
      workspaceId,
      memberId,
      access: body.access,
      role: body.role,
      scopeType: body.scopeType,
      projectIds: body.projectIds ?? [],
      tourIds: body.tourIds ?? [],
    });

    // Given access to a new band: send a plain "you've been added" note.
    if (!member.removed && addedProjectIds.length && member.email && member.access && !member.access.allProjects) {
      const names = await getProjectNamesForInviteScope(workspaceId, addedProjectIds);
      const bands = addedProjectIds.map((projectId, index) => {
        const entry = member.access && !member.access.allProjects ? member.access.entries.find((item) => item.projectId === projectId) : null;
        return { name: names[index] ?? '', role: (entry?.role ?? 'viewer') as 'editor' | 'crew' | 'viewer' | 'admin' };
      });
      const origin = request.nextUrl?.origin || request.headers.get('origin') || null;
      await sendAccessAddedEmailBestEffort({ email: member.email, bands, requestOrigin: origin });
    }

    return finalizeAuthResponse(NextResponse.json({ member }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to update member.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; memberId: string }> },
) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { workspaceId, memberId } = await params;

  try {
    const result = await removeWorkspaceMemberScoped(authState.supabase, authState.user.id, { workspaceId, memberId });
    return finalizeAuthResponse(NextResponse.json(result), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to remove member.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
