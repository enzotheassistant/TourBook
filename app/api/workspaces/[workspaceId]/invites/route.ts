import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { createWorkspaceInviteScoped, listWorkspaceInvitesScoped } from '@/lib/data/server/invites';

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
    const body = (await request.json()) as { email?: string; role?: string; expiresAt?: string | null };
    const created = await createWorkspaceInviteScoped(authState.supabase, authState.user.id, {
      workspaceId,
      email: body.email ?? '',
      role: body.role ?? '',
      expiresAt: body.expiresAt ?? null,
    });

    return finalizeAuthResponse(
      NextResponse.json({ invite: created.invite, acceptToken: created.token }, { status: 201 }),
      authState,
    );
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to create invite.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
