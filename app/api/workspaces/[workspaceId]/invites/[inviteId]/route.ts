import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { revokeWorkspaceInviteScoped } from '@/lib/data/server/invites';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; inviteId: string }> },
) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { workspaceId, inviteId } = await params;

  try {
    const invite = await revokeWorkspaceInviteScoped(authState.supabase, authState.user.id, {
      workspaceId,
      inviteId,
    });

    return finalizeAuthResponse(NextResponse.json({ invite }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to revoke invite.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
