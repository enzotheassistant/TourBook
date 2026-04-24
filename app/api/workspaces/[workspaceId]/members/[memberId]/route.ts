import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { removeWorkspaceMemberScoped } from '@/lib/data/server/members';

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
