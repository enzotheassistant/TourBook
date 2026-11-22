import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { getInviteBandsForEmail, revokeWorkspaceInviteScoped, updateWorkspaceInviteAccessScoped } from '@/lib/data/server/invites';
import { sendInviteEmailBestEffort } from '@/lib/invites/email-delivery';

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

/**
 * Change a waiting invite's access: body { access, sendEmail }.
 * With sendEmail, they get an "invite updated" email with a fresh link and
 * the old link stops working.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; inviteId: string }> },
) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { workspaceId, inviteId } = await params;

  try {
    const body = (await request.json()) as { access?: unknown; sendEmail?: boolean };
    const { invite, token } = await updateWorkspaceInviteAccessScoped(authState.supabase, authState.user.id, {
      workspaceId,
      inviteId,
      access: body.access,
      sendEmail: body.sendEmail !== false,
    });

    let emailDelivery = null;
    if (token) {
      const { data: workspace } = await authState.supabase.from('workspaces').select('name').eq('id', workspaceId).maybeSingle();
      const origin = request.nextUrl?.origin || request.headers.get('origin') || null;
      emailDelivery = await sendInviteEmailBestEffort({
        invite,
        acceptToken: token,
        workspaceName: workspace?.name ? String(workspace.name) : null,
        bands: await getInviteBandsForEmail(workspaceId, invite),
        updated: true,
        requestOrigin: origin,
      });
    }

    return finalizeAuthResponse(NextResponse.json({ invite, acceptToken: token, emailDelivery }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to update invite.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
