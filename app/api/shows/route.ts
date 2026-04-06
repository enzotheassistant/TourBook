import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { emptyShowForm } from '@/lib/defaults';
import { listShowsServer, upsertShowServer } from '@/lib/server-store';
import { normalizeShow } from '@/lib/normalize';
import { ShowFormValues } from '@/lib/types';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function GET() {
  const authResponse = await requireApiAuth();
  if (authResponse) return authResponse;

  const shows = await listShowsServer();
  return NextResponse.json(shows);
}

export async function POST(request: NextRequest) {
  const authResponse = await requireApiAuth();
  if (authResponse) return authResponse;

  const body = (await request.json()) as Partial<ShowFormValues>;
  const date = body.date ?? '';
  const city = body.city ?? '';
  const venueName = body.venue_name ?? '';
  const generatedId = `${slugify(city || 'show')}-${slugify(venueName || 'venue')}-${date || 'date'}`;

  const show = await upsertShowServer(
    normalizeShow({
      ...emptyShowForm,
      ...body,
      id: generatedId,
    }),
  );

  return NextResponse.json(show);
}
