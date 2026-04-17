import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { createWorkspaceForUser, listWorkspacesForUser } from '@/lib/data/server/workspaces';

export async function GET(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  try {
    const workspaces = await listWorkspacesForUser(authState.supabase, authState.user.id);
    return finalizeAuthResponse(NextResponse.json(workspaces), authState);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load workspaces.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status: 500 }), authState);
  }
}

export async function POST(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  try {
    const body = (await request.json()) as { name?: string; slug?: string | null };
    const workspace = await createWorkspaceForUser(authState.supabase, authState.user.id, {
      name: body.name ?? '',
      slug: body.slug ?? null,
    });
    return finalizeAuthResponse(NextResponse.json(workspace, { status: 201 }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to create workspace.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
