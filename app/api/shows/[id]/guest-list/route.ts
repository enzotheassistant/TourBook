import { NextRequest, NextResponse } from 'next/server';
import { mapScopedGuestListEntryToLegacy } from '@/lib/adapters/date-show';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { addGuestListEntriesScoped, listGuestListEntriesScoped } from '@/lib/data/server/guest-list';
import { ApiError } from '@/lib/data/server/shared';
import { recordLegacyEndpointTelemetry } from '@/lib/telemetry/legacy-endpoints';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';
  const { id } = await params;

  await recordLegacyEndpointTelemetry(request, {
    endpoint: '/api/shows/[id]/guest-list',
    workspaceId,
    projectId,
  });

  try {
    const entries = await listGuestListEntriesScoped(authState.user.id, workspaceId, id);
    return finalizeAuthResponse(NextResponse.json(entries.map(mapScopedGuestListEntryToLegacy)), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to load guest list.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';
  const { id } = await params;

  try {
    await recordLegacyEndpointTelemetry(request, {
      endpoint: '/api/shows/[id]/guest-list',
      workspaceId,
      projectId,
    });

    const body = (await request.json()) as { names?: string[] };
    const entries = await addGuestListEntriesScoped(authState.user.id, workspaceId, id, body.names ?? []);
    return finalizeAuthResponse(NextResponse.json(entries.map(mapScopedGuestListEntryToLegacy)), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to add guest list entries.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
