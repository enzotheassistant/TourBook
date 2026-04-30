import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { deleteDateScoped, getDateScoped, updateDateScoped } from '@/lib/data/server/dates';
import type { DateFormValues } from '@/lib/types/date-record';
import { recordApiRuntimeError } from '@/lib/telemetry/runtime-errors';
import { scheduleDebugLog } from '@/lib/debug/schedule-debug';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { id } = await params;

  try {
    const dateRecord = await getDateScoped(authState.supabase, authState.user.id, workspaceId, id);
    return finalizeAuthResponse(NextResponse.json(dateRecord), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    await recordApiRuntimeError(request, {
      endpoint: '/api/dates/[id]',
      status,
      error,
    });
    const message = error instanceof Error ? error.message : 'Unable to load date.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { id } = await params;

  try {
    const body = (await request.json()) as Partial<DateFormValues>;
    scheduleDebugLog({
      stage: 'server-save',
      action: 'api-dates-put-body',
      dateId: id,
      workspaceId: workspaceId || body.workspace_id || null,
      projectId: body.project_id ?? null,
      tourId: body.tour_id ?? null,
      status: body.status ?? null,
      dayType: body.day_type ?? null,
      note: 'PUT /api/dates/[id] request body schedule_items received by server',
    }, body.schedule_items);
    const dateRecord = await updateDateScoped(authState.supabase, authState.user.id, workspaceId, id, body);
    return finalizeAuthResponse(NextResponse.json(dateRecord), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    await recordApiRuntimeError(request, {
      endpoint: '/api/dates/[id]',
      status,
      error,
    });
    const message = error instanceof Error ? error.message : 'Unable to update date.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { id } = await params;

  try {
    await deleteDateScoped(authState.supabase, authState.user.id, workspaceId, id);
    return finalizeAuthResponse(NextResponse.json({ ok: true }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    await recordApiRuntimeError(request, {
      endpoint: '/api/dates/[id]',
      status,
      error,
    });
    const message = error instanceof Error ? error.message : 'Unable to delete date.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
