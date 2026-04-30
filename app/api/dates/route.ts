import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError, parseBooleanSearchParam } from '@/lib/data/server/shared';
import { createDateScoped, listDatesScoped } from '@/lib/data/server/dates';
import type { DateFormValues } from '@/lib/types/date-record';
import { recordApiRuntimeError } from '@/lib/telemetry/runtime-errors';
import { scheduleDebugLog } from '@/lib/debug/schedule-debug';

export async function GET(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';
  const tourId = request.nextUrl.searchParams.get('tourId');
  const includeDrafts = parseBooleanSearchParam(request.nextUrl.searchParams.get('includeDrafts'));

  try {
    const dates = await listDatesScoped(authState.supabase, {
      userId: authState.user.id,
      workspaceId,
      projectId,
      tourId,
      includeDrafts,
    });

    return finalizeAuthResponse(NextResponse.json(dates), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    await recordApiRuntimeError(request, {
      endpoint: '/api/dates',
      status,
      error,
    });
    const message = error instanceof Error ? error.message : 'Unable to load dates.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

export async function POST(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  try {
    const body = (await request.json()) as Partial<DateFormValues>;
    scheduleDebugLog({
      stage: 'server-save',
      action: 'api-dates-post-body',
      dateId: body.id ?? null,
      workspaceId: body.workspace_id ?? null,
      projectId: body.project_id ?? null,
      tourId: body.tour_id ?? null,
      status: body.status ?? null,
      dayType: body.day_type ?? null,
      note: 'POST /api/dates request body schedule_items received by server',
    }, body.schedule_items);
    const dateRecord = await createDateScoped(authState.supabase, authState.user.id, body);
    return finalizeAuthResponse(NextResponse.json(dateRecord), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    await recordApiRuntimeError(request, {
      endpoint: '/api/dates',
      status,
      error,
    });
    const message = error instanceof Error ? error.message : 'Unable to create date.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
