import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireAdminApiAuth } from '@/lib/auth';
import { runIntake } from '@/lib/ai/intake-provider';
import { listShowsServer } from '@/lib/server-store';
import { IntakeImageInput } from '@/lib/ai/intake-types';

export const runtime = 'nodejs';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBodyAsJson(payload: unknown) {
  const body = (payload ?? {}) as { text?: string };
  return {
    text: normalizeText(body.text),
    images: [] as IntakeImageInput[],
  };
}

async function parseBodyAsFormData(request: NextRequest) {
  const formData = await request.formData();
  const text = normalizeText(formData.get('text'));
  const files = formData.getAll('images').filter((value): value is File => value instanceof File);

  const images = await Promise.all(
    files
      .filter((file) => file.size > 0)
      .slice(0, 4)
      .map(async (file) => ({
        mimeType: file.type || 'image/jpeg',
        dataBase64: Buffer.from(await file.arrayBuffer()).toString('base64'),
        name: file.name,
      })),
  );

  return { text, images };
}

export async function POST(request: NextRequest) {
  const authState = await requireAdminApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  try {
    const contentType = request.headers.get('content-type') || '';
    const parsed = contentType.includes('multipart/form-data')
      ? await parseBodyAsFormData(request)
      : parseBodyAsJson(await request.json().catch(() => ({})));

    if (!parsed.text && parsed.images.length === 0) {
      return finalizeAuthResponse(NextResponse.json({ error: 'Add text or at least one image.' }, { status: 400 }), authState);
    }

    const existingShows = (await listShowsServer()).map((show) => ({
      id: show.id,
      date: show.date,
      city: show.city,
      venue_name: show.venue_name,
      status: show.status,
    }));

    const result = await runIntake({
      text: parsed.text,
      images: parsed.images,
      existingShows,
    });

    return finalizeAuthResponse(NextResponse.json(result), authState);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to review AI intake.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status: 500 }), authState);
  }
}
