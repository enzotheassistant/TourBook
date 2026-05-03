import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { resendWorkspaceInviteScoped, getProjectNamesForInviteScope } from '@/lib/data/server/invites';
import { sendInviteEmailBestEffort } from '@/lib/invites/email-delivery';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; inviteId: string }> },
) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { workspaceId, inviteId } = await params;

  try {
    const { invite, token } = await resendWorkspaceInviteScoped(
      authState.supabase,
      authState.user.id,
      { workspaceId, inviteId },
    );

    const { data: workspace } = await authState.supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .maybeSingle();

    const scopeProjectNames =
      invite.scopeType === 'projects'
        ? await getProjectNamesForInviteScope(workspaceId, invite.projectIds)
        : [];

    const origin = request.nextUrl?.origin || request.headers.get('origin') || null;
    const emailDelivery = await sendInviteEmailBestEffort({
      invite,
      acceptToken: token,
      workspaceName: workspace?.name ? String(workspace.name) : null,
      scopeProjectNames,
      requestOrigin: origin,
    });

    return finalizeAuthResponse(
      NextResponse.json({ invite, acceptToken: token, emailDelivery }),
      authState,
    );
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to resend invite.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
