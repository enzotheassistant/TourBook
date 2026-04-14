import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { listProjectsScoped } from '@/lib/data/server/projects';

export async function GET(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';

  try {
    const projects = await listProjectsScoped(authState.supabase, authState.user.id, workspaceId);
    return finalizeAuthResponse(NextResponse.json(projects), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to load projects.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
