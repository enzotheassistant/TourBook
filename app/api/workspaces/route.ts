import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { listWorkspacesForUser } from '@/lib/data/server/workspaces';

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
