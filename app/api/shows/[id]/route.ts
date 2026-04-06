import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { getShowServer, deleteShowServer, upsertShowServer } from '@/lib/server-store';
import { ShowFormValues } from '@/lib/types';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResponse = await requireApiAuth();
  if (authResponse) return authResponse;

  const { id } = await params;
  const show = await getShowServer(id);

  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  return NextResponse.json(show);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResponse = await requireApiAuth();
  if (authResponse) return authResponse;

  const { id } = await params;
  const body = (await request.json()) as ShowFormValues;
  const show = await upsertShowServer({ ...body, id });
  return NextResponse.json(show);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResponse = await requireApiAuth();
  if (authResponse) return authResponse;

  const { id } = await params;
  await deleteShowServer(id);
  return NextResponse.json({ ok: true });
}
