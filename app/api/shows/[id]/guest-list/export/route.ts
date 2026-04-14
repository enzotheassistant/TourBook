import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { exportGuestListCsvScoped } from '@/lib/data/server/guest-list';
import { ApiError } from '@/lib/data/server/shared';
import { recordLegacyEndpointTelemetry } from '@/lib/telemetry/legacy-endpoints';
import { getLegacyDeprecationPayload, isLegacyEndpointEnabled, LEGACY_DEPRECATION_STATUS } from '@/lib/config/legacy-flags';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;
  if (!isLegacyEndpointEnabled('showsApi')) return finalizeAuthResponse(NextResponse.json(getLegacyDeprecationPayload('showsApi'), { status: LEGACY_DEPRECATION_STATUS }), authState);

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';
  const { id } = await params;

  await recordLegacyEndpointTelemetry(request, {
    endpoint: '/api/shows/[id]/guest-list/export',
    workspaceId,
    projectId,
  });

  try {
    const csv = await exportGuestListCsvScoped(authState.supabase, authState.user.id, workspaceId, id);
    const response = new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${id}-guest-list.csv"`,
      },
    });
    return finalizeAuthResponse(response, authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to export guest list.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
