import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { createWorkspaceInviteScoped, getProjectNamesForInviteScope, listWorkspaceInvitesScoped } from '@/lib/data/server/invites';
import { sendInviteEmailBestEffort } from '@/lib/invites/email-delivery';

export async function GET(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { workspaceId } = await params;

  try {
    const invites = await listWorkspaceInvitesScoped(authState.supabase, authState.user.id, workspaceId);
    return finalizeAuthResponse(NextResponse.json({ invites }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to load invites.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { workspaceId } = await params;

  try {
    const body = (await request.json()) as { name?: string | null; email?: string; role?: string; scopeType?: string; projectIds?: string[]; tourIds?: string[]; expiresAt?: string | null };
    const created = await createWorkspaceInviteScoped(authState.supabase, authState.user.id, {
      workspaceId,
      name: body.name ?? null,
      email: body.email ?? '',
      role: body.role ?? '',
      scopeType: body.scopeType ?? 'workspace',
      projectIds: body.projectIds ?? [],
      tourIds: body.tourIds ?? [],
      expiresAt: body.expiresAt ?? null,
    });

    const { data: workspace } = await authState.supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .maybeSingle();

    const scopeProjectNames = created.invite.scopeType === 'projects'
      ? await getProjectNamesForInviteScope(workspaceId, created.invite.projectIds)
      : [];

    const origin = request.nextUrl?.origin || request.headers.get('origin') || null;
    const emailDelivery = await sendInviteEmailBestEffort({
      invite: created.invite,
      acceptToken: created.token,
      workspaceName: workspace?.name ? String(workspace.name) : null,
      scopeProjectNames,
      requestOrigin: origin,
    });

    return finalizeAuthResponse(
      NextResponse.json({ invite: created.invite, acceptToken: created.token, emailDelivery }, { status: 201 }),
      authState,
    );
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to create invite.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
