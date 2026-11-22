import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { deleteTourScoped, setTourArchivedScoped } from '@/lib/data/server/tours';

/** Archive or restore a tour: body { workspaceId, archived: boolean }. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ tourId: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;
  const { tourId } = await params;

  try {
    const body = (await request.json()) as { workspaceId?: string; archived?: boolean };
    const tour = await setTourArchivedScoped(authState.supabase, authState.user.id, {
      workspaceId: String(body.workspaceId ?? ''),
      tourId,
      archived: body.archived === true,
    });
    return finalizeAuthResponse(NextResponse.json({ tour }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to update tour.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

/** Delete a tour that has no dates: ?workspaceId=... */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ tourId: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;
  const { tourId } = await params;
  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';

  try {
    await deleteTourScoped(authState.supabase, authState.user.id, { workspaceId, tourId });
    return finalizeAuthResponse(NextResponse.json({ ok: true }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to delete tour.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
