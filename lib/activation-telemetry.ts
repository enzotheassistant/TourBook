import { getBrowserSupabaseClient } from '@/lib/supabase/client';

type ActivationPayload = {
  event: 'activation.empty_state_rendered' | 'activation.create_cta_clicked' | 'activation.create_success' | 'activation.create_failure';
  stateType?: string;
  cta?: string;
  entity?: 'workspace' | 'artist' | 'date';
  workspaceId?: string | null;
  projectId?: string | null;
  role?: string | null;
  reason?: string;
};

export async function trackActivationEvent(payload: ActivationPayload) {
  try {
    const supabase = getBrowserSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    await fetch('/api/telemetry/activation', {
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
