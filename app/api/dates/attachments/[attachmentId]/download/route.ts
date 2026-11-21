import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { getAttachmentDownloadUrlScoped } from '@/lib/data/server/attachments';
import { recordApiRuntimeError } from '@/lib/telemetry/runtime-errors';

export async function GET(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const variant = request.nextUrl.searchParams.get('variant') === 'thumbnail' ? 'thumbnail' : 'original';
  const { attachmentId } = await params;

  try {
    const { url } = await getAttachmentDownloadUrlScoped(authState.supabase, authState.user.id, workspaceId, attachmentId, variant);
    return finalizeAuthResponse(NextResponse.redirect(url), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    await recordApiRuntimeError(request, {
      endpoint: '/api/dates/attachments/[attachmentId]/download',
      status,
      error,
    });
    const message = error instanceof Error ? error.message : 'Unable to download the attachment.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
