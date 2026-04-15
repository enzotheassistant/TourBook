import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { recordInviteTelemetry } from '@/lib/telemetry/invites';

export async function POST(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  try {
    const body = await request.json().catch(() => ({}));
    await recordInviteTelemetry({
      event: body?.event,
      workspaceId: body?.workspaceId,
      inviteId: body?.inviteId,
      role: body?.role,
      reason: body?.reason,
    });
  } catch {
    // Fail-open by design.
  }

  return finalizeAuthResponse(NextResponse.json({ ok: true }), authState);
}
