import { NextRequest, NextResponse } from 'next/server';
import { mapDateRecordToShow, mapShowFormToDateForm } from '@/lib/adapters/date-show';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { deleteDateScoped, getDateScoped, updateDateScoped } from '@/lib/data/server/dates';
import type { ShowFormValues } from '@/lib/types';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { id } = await params;

  try {
    const dateRecord = await getDateScoped(authState.user.id, workspaceId, id);
    return finalizeAuthResponse(NextResponse.json(mapDateRecordToShow(dateRecord)), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Show not found.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { id } = await params;

  try {
    const body = (await request.json()) as ShowFormValues & { projectId?: string; tourId?: string | null };
    const current = await getDateScoped(authState.user.id, workspaceId, id);
    const projectId = body.projectId ?? current.project_id;
    const tourId = body.tourId ?? current.tour_id;
    const dateRecord = await updateDateScoped(authState.user.id, workspaceId, id, mapShowFormToDateForm(body, { workspaceId, projectId, tourId }));
    return finalizeAuthResponse(NextResponse.json(mapDateRecordToShow(dateRecord)), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to update show.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { id } = await params;

  try {
    await deleteDateScoped(authState.user.id, workspaceId, id);
    return finalizeAuthResponse(NextResponse.json({ ok: true }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to delete show.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
