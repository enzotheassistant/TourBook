import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { deleteAttachmentScoped, renameAttachmentScoped } from '@/lib/data/server/attachments';
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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { attachmentId } = await params;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      throw new ApiError(400, 'Invalid rename request.');
    }
    const attachment = await renameAttachmentScoped(authState.supabase, authState.user.id, workspaceId, attachmentId, (body as { displayName?: unknown }).displayName);
    return finalizeAuthResponse(NextResponse.json(attachment), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    await recordApiRuntimeError(request, {
      endpoint: '/api/dates/attachments/[attachmentId]',
      status,
      error,
    });
    const message = error instanceof Error ? error.message : 'Unable to rename the attachment.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
