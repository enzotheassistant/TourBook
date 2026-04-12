import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { listToursScoped } from '@/lib/data/server/tours';

export async function GET(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';

  try {
    const tours = await listToursScoped(authState.user.id, workspaceId, projectId);
    return finalizeAuthResponse(NextResponse.json(tours), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to load tours.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
