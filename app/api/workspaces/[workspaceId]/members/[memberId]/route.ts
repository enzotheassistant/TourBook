import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { removeWorkspaceMemberScoped, updateWorkspaceMemberScoped } from '@/lib/data/server/members';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; memberId: string }> },
) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { workspaceId, memberId } = await params;

  try {
    const body = (await request.json()) as { role?: string; scopeType?: string; projectIds?: string[]; tourIds?: string[] };
    const member = await updateWorkspaceMemberScoped(authState.supabase, authState.user.id, {
      workspaceId,
      memberId,
      role: body.role,
      scopeType: body.scopeType,
      projectIds: body.projectIds ?? [],
      tourIds: body.tourIds ?? [],
    });
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
