import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireAdminApiAuth, requireApiAuth } from '@/lib/auth';
import { createDraftId, createPublishedId, isDraftId } from '@/lib/drafts';
import { deleteShowServer, getShowServer, upsertShowServer } from '@/lib/server-store';
import { isValidStoredDate } from '@/lib/date';
import { normalizeShow } from '@/lib/normalize';
import { ShowFormValues, ShowStatus } from '@/lib/types';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { id } = await params;
  const show = await getShowServer(id);

  if (!show) {
    return finalizeAuthResponse(NextResponse.json({ error: 'Show not found' }, { status: 404 }), authState);
  }

  return finalizeAuthResponse(NextResponse.json(show), authState);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireAdminApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { id } = await params;
  const body = (await request.json()) as ShowFormValues & { status?: ShowStatus };
  const requestedStatus = body.status === 'draft' ? 'draft' : 'published';

  if (requestedStatus === 'published' && !isValidStoredDate(body.date)) {
    return finalizeAuthResponse(NextResponse.json({ error: 'Please enter a valid date in YYYY-MM-DD format.' }, { status: 400 }), authState);
  }

  const nextId = requestedStatus === 'draft'
    ? (isDraftId(id) ? id : createDraftId(`${body.city}-${body.venue_name}-${body.date || 'draft'}`))
    : createPublishedId(body.city, body.venue_name, body.date);

  const normalized = normalizeShow({ ...body, id: nextId, status: requestedStatus });
  const show = await upsertShowServer(normalized);

  if (nextId !== id && isDraftId(id)) {
    await deleteShowServer(id);
  }

  return finalizeAuthResponse(NextResponse.json(show), authState);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireAdminApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { id } = await params;
  await deleteShowServer(id);
  return finalizeAuthResponse(NextResponse.json({ ok: true }), authState);
}
