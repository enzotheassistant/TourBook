import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireAdminApiAuth, requireApiAuth } from '@/lib/auth';
import { createDraftId, createPublishedId } from '@/lib/drafts';
import { emptyShowForm } from '@/lib/defaults';
import { listShowsServer, upsertShowServer } from '@/lib/server-store';
import { normalizeShow } from '@/lib/normalize';
import { isValidStoredDate } from '@/lib/date';
import { ShowFormValues, ShowStatus } from '@/lib/types';

function serializeShow(show: ReturnType<typeof normalizeShow>) {
  return { ...show };
}

export async function GET(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const includeDrafts = request.nextUrl.searchParams.get('includeDrafts') === '1';
  const shows = await listShowsServer();
  return finalizeAuthResponse(
    NextResponse.json(includeDrafts ? shows : shows.filter((show) => show.status !== 'draft')),
    authState,
  );
}

export async function POST(request: NextRequest) {
  const authState = await requireAdminApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const body = (await request.json()) as Partial<ShowFormValues> & { status?: ShowStatus };
  const requestedStatus = body.status === 'draft' ? 'draft' : 'published';
  const date = body.date ?? '';
  const city = body.city ?? '';
  const venueName = body.venue_name ?? '';

  if (requestedStatus === 'published' && !isValidStoredDate(date)) {
    return finalizeAuthResponse(NextResponse.json({ error: 'Please enter a valid date in YYYY-MM-DD format.' }, { status: 400 }), authState);
  }

  const id = requestedStatus === 'draft'
    ? (body.id && body.id.startsWith('draft--') ? body.id : createDraftId(`${city}-${venueName}-${date || 'draft'}`))
    : createPublishedId(city, venueName, date);

  const show = await upsertShowServer(
    normalizeShow({
      ...emptyShowForm,
      ...body,
      id,
      status: requestedStatus,
    }),
  );

  return finalizeAuthResponse(NextResponse.json(serializeShow(show)), authState);
}
