import { NextRequest, NextResponse } from 'next/server';
import { mapDateRecordToShow, mapShowFormToDateForm } from '@/lib/adapters/date-show';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError, parseBooleanSearchParam } from '@/lib/data/server/shared';
import { createDateScoped, listDatesScoped } from '@/lib/data/server/dates';
import { recordLegacyEndpointTelemetry } from '@/lib/telemetry/legacy-endpoints';
import type { ShowFormValues } from '@/lib/types';
import { getLegacyDeprecationPayload, isLegacyEndpointEnabled, LEGACY_DEPRECATION_STATUS } from '@/lib/config/legacy-flags';

export async function GET(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;
  if (!isLegacyEndpointEnabled('showsApi')) return finalizeAuthResponse(NextResponse.json(getLegacyDeprecationPayload('showsApi'), { status: LEGACY_DEPRECATION_STATUS }), authState);

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';
  const tourId = request.nextUrl.searchParams.get('tourId');
  const includeDrafts = parseBooleanSearchParam(request.nextUrl.searchParams.get('includeDrafts'));

  await recordLegacyEndpointTelemetry(request, {
    endpoint: '/api/shows',
    workspaceId,
    projectId,
  });

  try {
    const dates = await listDatesScoped(authState.supabase, {
      userId: authState.user.id,
      workspaceId,
      projectId,
      tourId,
      includeDrafts,
    });
    return finalizeAuthResponse(NextResponse.json(dates.map(mapDateRecordToShow)), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to load shows.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

export async function POST(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;
  if (!isLegacyEndpointEnabled('showsApi')) return finalizeAuthResponse(NextResponse.json(getLegacyDeprecationPayload('showsApi'), { status: LEGACY_DEPRECATION_STATUS }), authState);

  try {
    const body = (await request.json()) as ShowFormValues & { workspaceId?: string; projectId?: string; tourId?: string | null };
    const workspaceId = body.workspaceId ?? request.nextUrl.searchParams.get('workspaceId') ?? '';
    const projectId = body.projectId ?? request.nextUrl.searchParams.get('projectId') ?? '';
    const tourId = body.tourId ?? request.nextUrl.searchParams.get('tourId');

    await recordLegacyEndpointTelemetry(request, {
      endpoint: '/api/shows',
      workspaceId,
      projectId,
    });

    const dateRecord = await createDateScoped(authState.supabase, authState.user.id, mapShowFormToDateForm(body, { workspaceId, projectId, tourId }));
    return finalizeAuthResponse(NextResponse.json(mapDateRecordToShow(dateRecord)), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to create show.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
