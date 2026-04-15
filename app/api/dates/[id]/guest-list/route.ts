import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { addGuestListEntriesScoped, listGuestListEntriesScoped } from '@/lib/data/server/guest-list';
import { ApiError } from '@/lib/data/server/shared';
import { recordApiRuntimeError } from '@/lib/telemetry/runtime-errors';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { id } = await params;

  try {
    const entries = await listGuestListEntriesScoped(authState.supabase, authState.user.id, workspaceId, id);
    return finalizeAuthResponse(NextResponse.json(entries), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    await recordApiRuntimeError(request, {
      endpoint: '/api/dates/[id]/guest-list',
      status,
      error,
    });
    const message = error instanceof Error ? error.message : 'Unable to load guest list.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { id } = await params;

  try {
    const body = (await request.json()) as { names?: string[] };
    const entries = await addGuestListEntriesScoped(authState.supabase, authState.user.id, workspaceId, id, body.names ?? []);
    return finalizeAuthResponse(NextResponse.json(entries), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    await recordApiRuntimeError(request, {
      endpoint: '/api/dates/[id]/guest-list',
      status,
      error,
    });
    const message = error instanceof Error ? error.message : 'Unable to add guest list entries.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
