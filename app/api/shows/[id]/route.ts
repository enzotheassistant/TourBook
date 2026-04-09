import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth, requireApiAuth } from '@/lib/auth';
import { deleteShowServer, getShowServer, upsertShowServer } from '@/lib/server-store';
import { isValidStoredDate } from '@/lib/date';
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
  const authResponse = await requireAdminApiAuth();
  if (authResponse) return authResponse;

  const { id } = await params;
  const body = (await request.json()) as ShowFormValues;

  if (!isValidStoredDate(body.date)) {
    return NextResponse.json({ error: 'Please enter a valid date in YYYY-MM-DD format.' }, { status: 400 });
  }

  const show = await upsertShowServer({ ...body, id });
  return NextResponse.json(show);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResponse = await requireAdminApiAuth();
  if (authResponse) return authResponse;

  const { id } = await params;
  await deleteShowServer(id);
  return NextResponse.json({ ok: true });
}
