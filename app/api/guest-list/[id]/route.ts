import { NextRequest, NextResponse } from 'next/server';
import { mapScopedGuestListEntryToLegacy } from '@/lib/adapters/date-show';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { deleteGuestListEntryScoped, updateGuestListEntryScoped } from '@/lib/data/server/guest-list';
import { recordLegacyEndpointTelemetry } from '@/lib/telemetry/legacy-endpoints';
import { getLegacyDeprecationPayload, isLegacyEndpointEnabled, LEGACY_DEPRECATION_STATUS } from '@/lib/config/legacy-flags';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;
  if (!isLegacyEndpointEnabled('guestListApi')) return finalizeAuthResponse(NextResponse.json(getLegacyDeprecationPayload('guestListApi'), { status: LEGACY_DEPRECATION_STATUS }), authState);

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';
  const { id } = await params;

  await recordLegacyEndpointTelemetry(request, {
    endpoint: '/api/guest-list/[id]',
    workspaceId,
    projectId,
  });

  try {
    const body = (await request.json()) as { name?: string };
    const entry = await updateGuestListEntryScoped(authState.user.id, workspaceId, id, body.name ?? '');
    return finalizeAuthResponse(NextResponse.json(mapScopedGuestListEntryToLegacy(entry)), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to update guest list entry.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;
  if (!isLegacyEndpointEnabled('guestListApi')) return finalizeAuthResponse(NextResponse.json(getLegacyDeprecationPayload('guestListApi'), { status: LEGACY_DEPRECATION_STATUS }), authState);

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';
  const { id } = await params;

  await recordLegacyEndpointTelemetry(request, {
    endpoint: '/api/guest-list/[id]',
    workspaceId,
    projectId,
  });

  try {
    await deleteGuestListEntryScoped(authState.user.id, workspaceId, id);
    return finalizeAuthResponse(NextResponse.json({ ok: true }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to delete guest list entry.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
