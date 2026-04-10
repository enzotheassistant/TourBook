import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/auth';
import { runAiIntake } from '@/lib/ai/intake-provider';
import { AiIntakeImageInput } from '@/lib/types';

function normalizeImageInputs(value: unknown) {
  if (!Array.isArray(value)) return [] as AiIntakeImageInput[];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name.trim() : 'upload';
      const mime_type = typeof record.mime_type === 'string' ? record.mime_type.trim() : '';
      const data_base64 = typeof record.data_base64 === 'string' ? record.data_base64.trim() : '';
      if (!mime_type || !data_base64) return null;
      return { name, mime_type, data_base64 } satisfies AiIntakeImageInput;
    })
    .filter((item): item is AiIntakeImageInput => Boolean(item))
    .slice(0, 4);
}

export async function POST(request: NextRequest) {
  const authResponse = await requireAdminApiAuth();
  if (authResponse) return authResponse;

  try {
    const body = (await request.json()) as { source_text?: unknown; images?: unknown };
    const source_text = typeof body.source_text === 'string' ? body.source_text : '';
    const images = normalizeImageInputs(body.images);

    if (!source_text.trim() && images.length === 0) {
      return NextResponse.json({ error: 'Provide pasted text or at least one image.' }, { status: 400 });
    }

    const payload = await runAiIntake({ source_text, images });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to run AI intake.' },
      { status: 500 },
    );
  }
}
