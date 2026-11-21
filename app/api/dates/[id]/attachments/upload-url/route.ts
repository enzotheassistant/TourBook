import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { createAttachmentUploadTicketScoped } from '@/lib/data/server/attachments';
import { recordApiRuntimeError } from '@/lib/telemetry/runtime-errors';

// Step 1 of an attachment upload: returns signed upload slots so the browser
// can send the file straight to Supabase Storage (see uploadAttachment in
// lib/data-client.ts). Only small JSON passes through here, never the file.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  const { id } = await params;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      throw new ApiError(400, 'Invalid upload request.');
    }

    const ticket = await createAttachmentUploadTicketScoped(authState.supabase, authState.user.id, workspaceId, id, body);
    return finalizeAuthResponse(NextResponse.json(ticket), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    await recordApiRuntimeError(request, {
      endpoint: '/api/dates/[id]/attachments/upload-url',
      status,
      error,
    });
    const message = error instanceof Error ? error.message : 'Unable to prepare the upload.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}
