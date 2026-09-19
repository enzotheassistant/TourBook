import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { listAttachmentsScoped, uploadAttachmentScoped } from '@/lib/data/server/attachments';
import { recordApiRuntimeError } from '@/lib/telemetry/runtime-errors';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { id } = await params;

  try {
    const attachments = await listAttachmentsScoped(authState.supabase, authState.user.id, workspaceId, id);
    return finalizeAuthResponse(NextResponse.json(attachments), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    await recordApiRuntimeError(request, {
      endpoint: '/api/dates/[id]/attachments',
      status,
      error,
    });
    const message = error instanceof Error ? error.message : 'Unable to load attachments.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { id } = await params;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      throw new ApiError(400, 'A file is required.');
    }

    const attachment = await uploadAttachmentScoped(authState.supabase, authState.user.id, workspaceId, id, file);
    return finalizeAuthResponse(NextResponse.json(attachment), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    await recordApiRuntimeError(request, {
      endpoint: '/api/dates/[id]/attachments',
      status,
      error,
    });
    const message = error instanceof Error ? error.message : 'Unable to upload the attachment.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
