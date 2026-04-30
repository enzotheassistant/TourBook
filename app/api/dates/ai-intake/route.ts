import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuthForWorkspaceAdmin, type AuthState } from '@/lib/auth';
import { runIntake } from '@/lib/ai/intake-provider';
import type { IntakeImageInput, IntakeRow } from '@/lib/ai/intake-types';
import { finalizeIntakeResult, pickAnchorTime } from '@/lib/ai/intake-normalization';
import { createDateScoped, listDatesScoped } from '@/lib/data/server/dates';
import { ApiError } from '@/lib/data/server/shared';
import type { DateFormValues } from '@/lib/types/date-record';

export const runtime = 'nodejs';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatDateForStorage(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function detectForcedYearFromText(sourceText: string) {
  const text = normalizeText(sourceText).toLowerCase();
  if (!text) return null;

  const patterns = [
    /all\s+(?:these\s+)?dates\s+(?:are\s+)?(?:in|for)\s+(20\d{2})/i,
    /all\s+(?:these\s+)?dates\s+(?:are\s+)?(20\d{2})/i,
    /(?:everything|all)\s+(?:is|in)\s+(20\d{2})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }

  // If the source text has exactly one explicit year, treat it as the intended year.
  // This catches inputs like "May 1 2027" even when the model rewrites rows.
  const yearMatches = [...text.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  const uniqueYears = [...new Set(yearMatches)];
  if (uniqueYears.length === 1) {
    return uniqueYears[0];
  }

  return null;
}

function normalizeAiImportDate(value: string, options?: { forcedYear?: number | null }) {
  const trimmed = normalizeText(value);
  if (!trimmed) return '';

  const normalized = trimmed.replace(/[./]/g, '-').replace(/\s+/g, ' ');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const forcedYear = options?.forcedYear ?? null;

  const finalizeCandidate = (candidate: Date, inferredYear: boolean) => {
    if (Number.isNaN(candidate.getTime())) return '';
    const normalizedCandidate = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
    if (inferredYear && normalizedCandidate < today) {
      normalizedCandidate.setFullYear(normalizedCandidate.getFullYear() + 1);
    }
    return formatDateForStorage(normalizedCandidate);
  };

  const tryParts = (year: number, month: number, day: number, inferredYear = false) => {
    const candidate = new Date(year, month - 1, day);
    if (candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day) {
      return finalizeCandidate(candidate, inferredYear);
    }
    return '';
  };

  const currentYear = today.getFullYear();

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-').map(Number);

    if (forcedYear) {
      return tryParts(forcedYear, month, day) || '';
    }

    // AI can over-eagerly output stale years for yearless source rows (e.g. 2024).
    // If returned year is not this/next year, normalize to this year or next year
    // based on whether the month/day has already passed.
    if (year !== currentYear && year !== currentYear + 1) {
      const thisYearCandidate = tryParts(currentYear, month, day);
      if (thisYearCandidate) {
        const thisYearDate = new Date(`${thisYearCandidate}T00:00:00`);
        if (!Number.isNaN(thisYearDate.getTime())) {
          return thisYearDate < today
            ? tryParts(currentYear + 1, month, day) || thisYearCandidate
            : thisYearCandidate;
        }
      }
    }

    // AI can over-eagerly roll all yearless dates to next year.
    // If we get next-year for a month/day that is still upcoming this year,
    // normalize back to current year.
    if (year === currentYear + 1) {
      const currentYearCandidate = tryParts(currentYear, month, day);
      if (currentYearCandidate) {
        const currentYearDate = new Date(`${currentYearCandidate}T00:00:00`);
        if (!Number.isNaN(currentYearDate.getTime()) && currentYearDate >= today) {
          return currentYearCandidate;
        }
      }
    }

    // Conversely, if AI gives current-year for a month/day already passed,
    // treat it as next year for yearless routing style input.
    if (year === currentYear) {
      const currentYearCandidate = tryParts(currentYear, month, day);
      if (currentYearCandidate) {
        const currentYearDate = new Date(`${currentYearCandidate}T00:00:00`);
        if (!Number.isNaN(currentYearDate.getTime()) && currentYearDate < today) {
          return tryParts(currentYear + 1, month, day) || currentYearCandidate;
        }
      }
    }

    return tryParts(year, month, day);
  }

  if (/^\d{1,2}-\d{1,2}$/.test(normalized)) {
    const [month, day] = normalized.split('-').map(Number);
    if (forcedYear) {
      return tryParts(forcedYear, month, day) || '';
    }
    return tryParts(currentYear, month, day, true);
  }

  if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(normalized)) {
    let [month, day, year] = normalized.split('-').map(Number);
    if (forcedYear) {
      return tryParts(forcedYear, month, day) || '';
    }
    if (year < 100) year += 2000;
    return tryParts(year, month, day);
  }

  const hasExplicitYear = /\b\d{4}\b/.test(trimmed);
  const parseTarget = hasExplicitYear ? trimmed : `${trimmed} ${forcedYear || currentYear}`;
  const parsed = new Date(parseTarget);
  if (!Number.isNaN(parsed.getTime())) {
    if (forcedYear) {
      const forced = new Date(forcedYear, parsed.getMonth(), parsed.getDate());
      return finalizeCandidate(forced, false);
    }
    return finalizeCandidate(parsed, !hasExplicitYear);
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

function normalizeReviewedRows(rows: unknown): IntakeRow[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    const source = (row ?? {}) as IntakeRow;
    const scheduleItems = Array.isArray(source.schedule_items)
      ? source.schedule_items.map((item) => ({
          label: normalizeText(item?.label),
          time: normalizeText(item?.time),
        }))
      : [];

    return {
      date: normalizeText(source.date),
      city: normalizeText(source.city),
      region: normalizeText(source.region),
      venue_name: normalizeText(source.venue_name),
      tour_name: normalizeText(source.tour_name),
      venue_address: normalizeText(source.venue_address),
      dos_name: normalizeText(source.dos_name),
      dos_phone: normalizeText(source.dos_phone),
      parking_load_info: normalizeText(source.parking_load_info),
      schedule_items: scheduleItems,
      hotel_name: normalizeText(source.hotel_name),
      hotel_address: normalizeText(source.hotel_address),
      hotel_notes: normalizeText(source.hotel_notes),
      notes: normalizeText(source.notes),
      confidence: typeof source.confidence === 'number' ? source.confidence : undefined,
      flags: Array.isArray(source.flags) ? source.flags.filter((flag): flag is string => typeof flag === 'string' && flag.trim().length > 0) : [],
    };
  });
}

function parseBodyAsJson(payload: unknown) {
  const body = (payload ?? {}) as { text?: string; workspaceId?: string; projectId?: string; tourId?: string | null; previewOnly?: boolean | string; rows?: unknown };
  return {
    text: normalizeText(body.text),
    workspaceId: normalizeText(body.workspaceId),
    projectId: normalizeText(body.projectId),
    tourId: normalizeText(body.tourId) || null,
    previewOnly: parsePreviewOnly(body.previewOnly),
    images: [] as IntakeImageInput[],
    rows: normalizeReviewedRows(body.rows),
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

  return { text, workspaceId, projectId, tourId, previewOnly, images, rows: [] as IntakeRow[] };
}

export async function POST(request: NextRequest) {
  let authState: AuthState | undefined;

  try {
    const contentType = request.headers.get('content-type') || '';
    const parsed = contentType.includes('multipart/form-data')
      ? await parseBodyAsFormData(request)
      : parseBodyAsJson(await request.json().catch(() => ({})));

    const adminAuth = await requireApiAuthForWorkspaceAdmin(request, parsed.workspaceId);
    if (adminAuth instanceof NextResponse) return adminAuth;
    authState = adminAuth;

    if (!parsed.workspaceId || !parsed.projectId) {
      return finalizeAuthResponse(NextResponse.json({ error: 'workspaceId and projectId are required.' }, { status: 400 }), authState);
    }

    if (!parsed.text && parsed.images.length === 0 && parsed.rows.length === 0) {
      return finalizeAuthResponse(NextResponse.json({ error: 'Add text, reviewed rows, or at least one image.' }, { status: 400 }), authState);
    }

    const existingDates = await listDatesScoped(authState.supabase, {
      userId: authState.user.id,
      workspaceId: parsed.workspaceId,
      projectId: parsed.projectId,
      tourId: parsed.tourId,
      includeDrafts: true,
    });

    const forcedYear = detectForcedYearFromText(parsed.text);
    const normalizedRows = parsed.rows.length
      ? finalizeIntakeResult({ rows: parsed.rows, provider: 'review', model: 'manual' }, parsed.text).rows.map((row) => ({
          ...row,
          date: normalizeAiImportDate(row.date, { forcedYear }) || row.date,
        }))
      : finalizeIntakeResult(await runIntake({
          text: parsed.text,
          images: parsed.images,
          existingShows: existingDates.map((date) => ({
            id: date.id,
            date: date.date,
            city: date.city,
            venue_name: date.venue_name,
            status: date.status,
          })),
        }), parsed.text).rows.map((row) => ({
          ...row,
          date: normalizeAiImportDate(row.date, { forcedYear }) || row.date,
        }));
    const normalizedIntake = finalizeIntakeResult({
      rows: normalizedRows,
      provider: parsed.rows.length ? 'review' : 'ai',
      model: parsed.rows.length ? 'manual' : 'intake',
    }, parsed.text);

    if (parsed.previewOnly) {
      return finalizeAuthResponse(NextResponse.json(normalizedIntake), authState);
    }

    const createdDates = [];

    for (const row of normalizedRows) {
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

      const created = await createDateScoped(authState.supabase, authState.user.id, values);
      createdDates.push(created);
    }

    return finalizeAuthResponse(NextResponse.json({ intake: normalizedIntake, createdDates }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to run AI intake.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
