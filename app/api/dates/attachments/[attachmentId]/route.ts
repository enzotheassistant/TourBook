import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { deleteAttachmentScoped } from '@/lib/data/server/attachments';
import { recordApiRuntimeError } from '@/lib/telemetry/runtime-errors';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { attachmentId } = await params;

  try {
    await deleteAttachmentScoped(authState.supabase, authState.user.id, workspaceId, attachmentId);
    return finalizeAuthResponse(NextResponse.json({ ok: true }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    await recordApiRuntimeError(request, {
      endpoint: '/api/dates/attachments/[attachmentId]',
      status,
      error,
    });
    const message = error instanceof Error ? error.message : 'Unable to delete the attachment.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
