import { getBrowserSupabaseClient } from '@/lib/supabase/client';

type InviteTelemetryPayload = {
  event: 'invite.created' | 'invite.revoked' | 'invite.accepted' | 'invite.failed';
  workspaceId?: string;
  inviteId?: string;
  role?: string;
  reason?: string;
};

export async function trackInviteEvent(payload: InviteTelemetryPayload) {
  try {
    const supabase = getBrowserSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    await fetch('/api/telemetry/invites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify(payload),
    });
  } catch {
    // Fail-open telemetry.
  }
}
