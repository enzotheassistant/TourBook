import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { deleteGuestListEntryServer, updateGuestListEntryServer } from '@/lib/server-store';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResponse = await requireApiAuth();
  if (authResponse) return authResponse;

  const { id } = await params;
  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim() ?? '';

  if (!name) {
    return NextResponse.json({ error: 'Guest list entry cannot be empty.' }, { status: 400 });
  }

  const entry = await updateGuestListEntryServer(id, name);
  return NextResponse.json(entry);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResponse = await requireApiAuth();
  if (authResponse) return authResponse;

  const { id } = await params;
  await deleteGuestListEntryServer(id);
  return NextResponse.json({ ok: true });
}
