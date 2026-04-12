import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireAdminApiAuth } from '@/lib/auth';
import { runIntake } from '@/lib/ai/intake-provider';
import type { IntakeImageInput, IntakeScheduleItem } from '@/lib/ai/intake-types';
import { createDateScoped, listDatesScoped } from '@/lib/data/server/dates';
import { ApiError } from '@/lib/data/server/shared';
import type { DateFormValues } from '@/lib/types/date-record';

export const runtime = 'nodejs';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeScheduleLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pickAnchorTime(items: IntakeScheduleItem[] | undefined, labels: string[]) {
  const normalizedTargets = new Set(labels.map((label) => normalizeScheduleLabel(label)));
  for (const item of items ?? []) {
    const normalized = normalizeScheduleLabel(item.label ?? '');
    if (normalizedTargets.has(normalized) && (item.time ?? '').trim()) {
      return item.time.trim();
    }
  }
  return '';
}

function parsePreviewOnly(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'preview';
  }
  return false;
}

function parseBodyAsJson(payload: unknown) {
  const body = (payload ?? {}) as { text?: string; workspaceId?: string; projectId?: string; tourId?: string | null; previewOnly?: boolean | string };
  return {
    text: normalizeText(body.text),
    workspaceId: normalizeText(body.workspaceId),
    projectId: normalizeText(body.projectId),
    tourId: normalizeText(body.tourId) || null,
    previewOnly: parsePreviewOnly(body.previewOnly),
    images: [] as IntakeImageInput[],
  };
}

async function parseBodyAsFormData(request: NextRequest) {
  const formData = await request.formData();
  const text = normalizeText(formData.get('text'));
  const workspaceId = normalizeText(formData.get('workspaceId'));
  const projectId = normalizeText(formData.get('projectId'));
  const tourId = normalizeText(formData.get('tourId')) || null;
  const previewOnly = parsePreviewOnly(formData.get('previewOnly'));
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

  return { text, workspaceId, projectId, tourId, previewOnly, images };
}

export async function POST(request: NextRequest) {
  const authState = await requireAdminApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  try {
    const contentType = request.headers.get('content-type') || '';
    const parsed = contentType.includes('multipart/form-data')
      ? await parseBodyAsFormData(request)
      : parseBodyAsJson(await request.json().catch(() => ({})));

    if (!parsed.workspaceId || !parsed.projectId) {
      return finalizeAuthResponse(NextResponse.json({ error: 'workspaceId and projectId are required.' }, { status: 400 }), authState);
    }

    if (!parsed.text && parsed.images.length === 0) {
      return finalizeAuthResponse(NextResponse.json({ error: 'Add text or at least one image.' }, { status: 400 }), authState);
    }

    const existingDates = await listDatesScoped({
      userId: authState.user.id,
      workspaceId: parsed.workspaceId,
      projectId: parsed.projectId,
      tourId: parsed.tourId,
      includeDrafts: true,
    });

    const intake = await runIntake({
      text: parsed.text,
      images: parsed.images,
      existingShows: existingDates.map((date) => ({
        id: date.id,
        date: date.date,
        city: date.city,
        venue_name: date.venue_name,
        status: date.status,
      })),
    });

    if (parsed.previewOnly) {
      return finalizeAuthResponse(NextResponse.json(intake), authState);
    }

    const createdDates = [];

    for (const row of intake.rows) {
      const values: Partial<DateFormValues> = {
        workspace_id: parsed.workspaceId,
        project_id: parsed.projectId,
        tour_id: parsed.tourId,
        status: 'draft',
        date: row.date,
        city: row.city,
        region: row.region,
        venue_name: row.venue_name,
        legacy_tour_name: row.tour_name || null,
        venue_address: row.venue_address || '',
        dos_name: row.dos_name || '',
        dos_phone: row.dos_phone || '',
        parking_load_info: row.parking_load_info || '',
        hotel_name: row.hotel_name || '',
        hotel_address: row.hotel_address || '',
        hotel_notes: row.hotel_notes || '',
        notes: row.notes || '',
        schedule_items: (row.schedule_items ?? []).map((item, index) => ({
          label: item.label,
          time_text: item.time,
          sort_order: index,
        })),
        load_in_time: pickAnchorTime(row.schedule_items, ['load', 'load in', 'load-in']),
        soundcheck_time: pickAnchorTime(row.schedule_items, ['soundcheck']),
        doors_time: pickAnchorTime(row.schedule_items, ['doors']),
        show_time: pickAnchorTime(row.schedule_items, ['show']),
        curfew_time: pickAnchorTime(row.schedule_items, ['curfew']),
      };

      const created = await createDateScoped(authState.user.id, values);
      createdDates.push(created);
    }

    return finalizeAuthResponse(NextResponse.json({ intake, createdDates }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to review AI intake.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
