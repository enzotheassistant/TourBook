import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth, requireApiAuth } from '@/lib/auth';
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
  const authResponse = await requireApiAuth();
  if (authResponse) return authResponse;

  const includeDrafts = request.nextUrl.searchParams.get('includeDrafts') === '1';
  const shows = await listShowsServer();
  return NextResponse.json(includeDrafts ? shows : shows.filter((show) => show.status !== 'draft'));
}

export async function POST(request: NextRequest) {
  const authResponse = await requireAdminApiAuth();
  if (authResponse) return authResponse;

  const body = (await request.json()) as Partial<ShowFormValues> & { status?: ShowStatus };
  const requestedStatus = body.status === 'draft' ? 'draft' : 'published';
  const date = body.date ?? '';
  const city = body.city ?? '';
  const venueName = body.venue_name ?? '';

  if (requestedStatus === 'published' && !isValidStoredDate(date)) {
    return NextResponse.json({ error: 'Please enter a valid date in YYYY-MM-DD format.' }, { status: 400 });
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

  return NextResponse.json(serializeShow(show));
}
