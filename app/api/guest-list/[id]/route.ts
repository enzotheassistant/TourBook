import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { deleteGuestListEntryServer, updateGuestListEntryServer } from '@/lib/server-store';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { id } = await params;
  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim() ?? '';

  if (!name) {
    return finalizeAuthResponse(NextResponse.json({ error: 'Guest list entry cannot be empty.' }, { status: 400 }), authState);
  }

  const entry = await updateGuestListEntryServer(id, name);
  return finalizeAuthResponse(NextResponse.json(entry), authState);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { id } = await params;
  await deleteGuestListEntryServer(id);
  return finalizeAuthResponse(NextResponse.json({ ok: true }), authState);
}
