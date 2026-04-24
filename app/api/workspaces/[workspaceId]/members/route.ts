import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { listWorkspaceMembersScoped } from '@/lib/data/server/members';

export async function GET(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { workspaceId } = await params;

  try {
    const members = await listWorkspaceMembersScoped(authState.supabase, authState.user.id, workspaceId);
    return finalizeAuthResponse(NextResponse.json({ members }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to load members.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
