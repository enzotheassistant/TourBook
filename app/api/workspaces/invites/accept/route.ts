import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { acceptWorkspaceInvitePrivileged } from '@/lib/data/server/invites';
import { ApiError } from '@/lib/data/server/shared';

export async function POST(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  try {
    const body = (await request.json()) as { token?: string };
    const accepted = await acceptWorkspaceInvitePrivileged({
      userId: authState.user.id,
      userEmail: authState.user.email,
      token: body.token ?? '',
    });

    return finalizeAuthResponse(NextResponse.json(accepted), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to accept invite.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
