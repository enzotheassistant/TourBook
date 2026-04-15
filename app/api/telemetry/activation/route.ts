import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { recordActivationTelemetry } from '@/lib/telemetry/activation';

export async function POST(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  try {
    const body = await request.json().catch(() => ({}));
    await recordActivationTelemetry({
      event: body?.event,
      stateType: body?.stateType,
      cta: body?.cta,
      entity: body?.entity,
      workspaceId: body?.workspaceId,
      projectId: body?.projectId,
      role: body?.role,
      reason: body?.reason,
    });
  } catch {
    // Fail-open by design.
  }

  return finalizeAuthResponse(NextResponse.json({ ok: true }), authState);
}
