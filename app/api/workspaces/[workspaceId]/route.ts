import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { renameWorkspaceForUser } from '@/lib/data/server/workspaces';

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
