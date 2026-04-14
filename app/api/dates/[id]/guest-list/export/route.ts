import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { exportGuestListCsvScoped } from '@/lib/data/server/guest-list';
import { ApiError } from '@/lib/data/server/shared';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { id } = await params;

  try {
    const csv = await exportGuestListCsvScoped(authState.supabase, authState.user.id, workspaceId, id);
    const response = new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="guest-list-${id}.csv"`,
      },
    });
    return finalizeAuthResponse(response, authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to export guest list.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
