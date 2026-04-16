import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { deleteProjectScoped, renameProjectScoped } from '@/lib/data/server/projects';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { projectId } = await params;

  try {
    const body = (await request.json()) as { workspaceId?: string; name?: string };
    const project = await renameProjectScoped(authState.supabase, authState.user.id, {
      workspaceId: body.workspaceId ?? '',
      projectId,
      name: body.name ?? '',
    });
    return finalizeAuthResponse(NextResponse.json(project), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to rename artist.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}


export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { projectId } = await params;

  try {
    const body = (await request.json()) as { workspaceId?: string };
    const result = await deleteProjectScoped(authState.supabase, authState.user.id, {
      workspaceId: body.workspaceId ?? '',
      projectId,
    });
    return finalizeAuthResponse(NextResponse.json(result), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to delete artist.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
