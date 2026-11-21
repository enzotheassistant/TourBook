import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { finalizeAttachmentUploadScoped, listAttachmentsScoped } from '@/lib/data/server/attachments';
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

  // Step 3 of an attachment upload: the browser has already sent the file
  // straight to Storage; this confirms it landed and records it.
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      throw new ApiError(400, 'Invalid upload request.');
    }

    const attachment = await finalizeAttachmentUploadScoped(authState.supabase, authState.user.id, workspaceId, id, body);
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
