import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { deleteGuestListEntryScoped, updateGuestListEntryScoped } from '@/lib/data/server/guest-list';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { id } = await params;

  try {
    const body = (await request.json()) as { name?: string };
    const entry = await updateGuestListEntryScoped(authState.supabase, authState.user.id, workspaceId, id, body.name ?? '');
    return finalizeAuthResponse(NextResponse.json(entry), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to update guest list entry.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { id } = await params;

  try {
    await deleteGuestListEntryScoped(authState.supabase, authState.user.id, workspaceId, id);
    return finalizeAuthResponse(NextResponse.json({ ok: true }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to delete guest list entry.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
