import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { renameWorkspaceForUser } from '@/lib/data/server/workspaces';
import { deleteOwnedWorkspace } from '@/lib/data/server/account-deletion';

/** Rename a workspace (owner only): body { name }. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;
  const { workspaceId } = await params;

  try {
    const body = (await request.json()) as { name?: string };
    const workspace = await renameWorkspaceForUser(authState.supabase, authState.user.id, { workspaceId, name: body.name ?? '' });
    return finalizeAuthResponse(NextResponse.json({ workspace }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to rename workspace.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

/** Delete a workspace and everything in it (owner only): body { confirmName, password }. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;
  const { workspaceId } = await params;

  try {
    const body = (await request.json().catch(() => ({}))) as { confirmName?: string; password?: string };
    const workspace = await deleteOwnedWorkspace(authState.supabase, {
      userId: authState.user.id,
      email: authState.user.email ?? '',
      workspaceId,
      confirmName: body.confirmName ?? '',
      password: body.password ?? '',
    });
    return finalizeAuthResponse(NextResponse.json({ deleted: workspace }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to delete workspace.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
